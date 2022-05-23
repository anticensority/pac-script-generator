package main

import (
	"bufio"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"encoding/json"
	"text/template"

	"bytes"
	"encoding/binary"
	"net"

	"golang.org/x/net/idna"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/transform"
)

var ifForced = flag.Bool("force", false, "If to ignore checking of an updated dump.csv available")

type blockProvider struct {
	urls   []string
	rssUrl string
}

var blockProviders = []blockProvider{
	blockProvider{
		urls: []string{
			"https://svn.code.sf.net/p/zapret-info/code/dump.csv",
		},
		rssUrl: "https://sourceforge.net/p/zapret-info/code/feed",
	},
	blockProvider{
		urls: []string{
			"https://raw.githubusercontent.com/zapret-info/z-i/master/dump.csv",
		},
		rssUrl: "https://github.com/zapret-info/z-i/commits/master.atom",
	},
	//blockProvider {
	//	urls: []string{
	//		"https://app.assembla.com/spaces/z-i/git/source/master/dump.csv?_format=raw",
	//	},
	//	rssUrl: "https://app.assembla.com/spaces/z-i/stream.rss",
	//},
}

var get = func(url string) (*http.Response, error) {

	fmt.Println("GETting " + url)
	response, err := http.Get(url)
	fmt.Println("Got")
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return response, fmt.Errorf("Negative status code: " + strconv.Itoa(response.StatusCode) + ". For url: " + url)
	}
	return response, nil
}
var getOrDie = func(url string) *http.Response {

	response, err := get(url)
	if err != nil {
		panic(err)
	}
	return response
}

type GhCommit struct {
	Message string `json:"message,omitempty"`
	Tree    string `json:"tree,omitempty"`
}
type GhCommits []struct {
	Commit GhCommit
}

func main() {

	GH_REPO := os.Getenv("GH_REPO")
	GH_TOKEN := os.Getenv("GH_TOKEN")
	if GH_REPO == "" || GH_TOKEN == "" {
		panic("Provide GH_REPO and GH_TOKEN environment variables!")
	}
	REPO_URL := "https://api.github.com/repos/" + GH_REPO
	var (
		text     []byte
		response *http.Response
		err      error
	)
	HOSTNAMES := make(map[string]bool)
	lastUpdateMessage := ""
	flag.Parse()
	if *ifForced == false {

		response := getOrDie(REPO_URL + "/commits")
		text, err = ioutil.ReadAll(response.Body)
		if err != nil {
			panic(err)
		}
		response.Body.Close()
		commits := &GhCommits{}
		json.Unmarshal(text, commits)
		lastUpdateMessage = (*commits)[0].Commit.Message
	}
	var newUpdateMessage string

	updatedRegexp := regexp.MustCompile(`Updated: \d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d [+-]0000`)

	var bestProvider *blockProvider = nil
	for _, provider := range blockProviders {
		response, err := get(provider.rssUrl)
		if err != nil {
			fmt.Println("Skipping provider because of:", err)
			continue
		}
		scanner := bufio.NewScanner(response.Body)
		for scanner.Scan() {
			match := updatedRegexp.FindString(scanner.Text())
			if match != "" {
				if lastUpdateMessage < match {
					newUpdateMessage = match
					bestProvider = &provider
					break
				}
			}
		}
		if err := scanner.Err(); err != nil {
			panic(err)
		}
		response.Body.Close()
		if bestProvider != nil {
			break
		}
	}
	if bestProvider == nil {
		fmt.Println("No newer dump.csv published yet!")
		os.Exit(0)
	}
	urls := bestProvider.urls
	fmt.Println("Best provider urls are:", urls)

	// Ingored hostnames

	response = getOrDie("https://bitbucket.org/ValdikSS/antizapret/raw/master/ignorehosts.txt")
	fmt.Println("Downloaded ingoredhosts.")

	ignoredHostnames := make(map[string]bool)
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		ignoredHostnames[scanner.Text()] = true
	}
	response.Body.Close()
	fmt.Println("Parsed ingoredhosts.txt.")

	// Not found hostnames

	response = getOrDie("https://raw.githubusercontent.com/zapret-info/z-i/master/nxdomain.txt")
	fmt.Println("Downloaded nxdomians.")

	nxdomains := make(map[string]bool)
	scanner = bufio.NewScanner(response.Body)
	for scanner.Scan() {
		nxdomains[scanner.Text()] = true
	}

	if err := scanner.Err(); err != nil {
		panic(err)
	}
	response.Body.Close()
	fmt.Println("Parsed nxdomians.")

	// ТСПУ (TSPU), list of shaped hostnames

	response = getOrDie("https://registry.censortracker.org/registry-api/domains/?countryCode=ru")
	text, err = ioutil.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}
	response.Body.Close()
	tspus := &[]struct {
		Domains []string
	}{}
	json.Unmarshal(text, tspus)
	for _, record := range (*tspus) {
		for _, hostname := range record.Domains {
			HOSTNAMES[hostname] = true
		}
	}
	fmt.Println("Got shaped hostnames (TSPU).")

	var lastError error
	for _, url := range urls {
		response, err = get(url)
		if err == nil {
			break
		}
		lastError = err
		response = nil
	}
	if response == nil {
		panic(lastError)
	}
	csvIn := bufio.NewReader(response.Body)
	fmt.Println("Downloaded csv.")

	_, err = csvIn.ReadString('\n')
	if err != nil {
		panic(err)
	}

	reader := csv.NewReader(transform.NewReader(csvIn, charmap.Windows1251.NewDecoder()))
	reader.Comma = ';'
	reader.FieldsPerRecord = 6
	idna := idna.New()
	customHostnames := map[string]bool{
		// Extremism:
		"pravdabeslana.ru": true,
		// WordPress:
		"putinism.wordpress.com": true,
		"6090m01.wordpress.com":  true,
		// Custom hosts
		"archive.org": true,
		"bitcoin.org": true,
		// LinkedIn
		"licdn.com":    true,
		"linkedin.com": true,
		// Based on users complaints:
		"koshara.net":     true,
		"koshara.co":      true,
		"new-team.org":    true,
		"fast-torrent.ru": true,
		"pornreactor.cc":  true,
		"joyreactor.cc":   true,
		"nnm-club.name":   true,
		"rutor.info":      true,
		"free-rutor.org":  true,
		// Rutracker complaints:
		"static.t-ru.org": true,
		"rutrk.org":       true,

		"nnm-club.ws":    true,
		"lostfilm.tv":    true,
		"e-hentai.org":   true,
		"deviantart.net": true, // https://groups.google.com/forum/#!topic/anticensority/uXFsOS1lQ2
		"kaztorka.org":   true, // https://groups.google.com/forum/#!msg/anticensority/vweNToREQ1o/3EbhCDjfAgAJ
	}
	for hostname, ifBlocked := range customHostnames {
		HOSTNAMES[hostname] = ifBlocked
	}
	customHostnames = nil
	runtime.GC()
	ipv4 := make(map[string]bool)
	ipv4subnets := make(map[string]bool)
	ipv6 := make(map[string]bool)

	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			panic(err)
		}
		ifHasHostname := false
		hostnamesSlice := strings.Split(record[1], "|")
		for _, hostname := range hostnamesSlice {
			hostname = strings.Trim(hostname, " \t")
			if hostname != "" {
				hostname, err := idna.ToASCII(hostname)
				if err != nil {
					panic(err)
				}
				if strings.HasPrefix(hostname, "*.") {
					hostname = hostname[2:]
				}
				if nxdomains[hostname] || ignoredHostnames[hostname] {
					continue
				}
				if strings.HasPrefix(hostname, "www.") {
					hostname = hostname[4:]
				}
				HOSTNAMES[hostname] = true
				ifHasHostname = true
			}
		}
		if !ifHasHostname {
			ips := strings.Split(record[0], "|")
			for _, ip := range ips {
				ip = strings.Trim(ip, " \t")
				ifIpV6 := strings.ContainsAny(ip, ":")
				if ifIpV6 {
					ipv6[ip] = true
					continue
				}
				ifSubnet := strings.ContainsAny(ip, "/")
				if ifSubnet {
					ipv4subnets[ip] = true
					continue
				}
				ipv4[ip] = true
			}
		}
	}
	response.Body.Close()
	response = nil
	fmt.Println("Parsed csv.")
	runtime.GC()

	// Converts IP mask to 16 bit unsigned integer.
	addrToInt := func(in []byte) int {

		//var i uint16
		var i int32
		buf := bytes.NewReader(in)
		err := binary.Read(buf, binary.BigEndian, &i)
		if err != nil {
			panic(err)
		}
		return int(i)
	}
	getSubnets := func(m map[string]bool) [][]int {

		keys := make([][]int, len(m))
		i := 0
		for maskedNet := range m {
			_, mask, err := net.ParseCIDR(maskedNet)
			if err != nil {
				panic(err)
			}
			keys[i] = []int{addrToInt([]byte(mask.IP)), addrToInt([]byte(mask.Mask))}
			i++
		}
		return keys
	}
	getOptimizedMap := func(m map[string]bool) map[int]string {

		opt := make(map[int][]string)
		for key := range m {
			length := len(key)
			if opt[length] == nil {
				opt[length] = []string{key}
				continue
			}
			opt[length] = append(opt[length], key)
		}
		opt2 := make(map[int]string)
		for key := range opt {
			sort.Strings(opt[key])
			opt2[key] = strings.Join(opt[key], "")
		}
		return opt2
	}
	ipv4Map := getOptimizedMap(ipv4)
	//ipv6Map := getOptimizedMap(ipv6)
	ipv4subnetsKeys := getSubnets(ipv4subnets)
	hostnamesMap := getOptimizedMap(HOSTNAMES)

	ipv4 = nil
	ipv6 = nil
	ipv4subnets = nil
	HOSTNAMES = nil
	runtime.GC()
	fmt.Println("Opening template...")

	tmpl, err := template.ParseFiles("./template.js")
	if err != nil {
		panic(err)
	}
	values := &struct {
		IPS            map[int]string
		HOSTNAMES      map[int]string
		MASKED_SUBNETS [][]int
	}{
		IPS:            ipv4Map,
		HOSTNAMES:      hostnamesMap,
		MASKED_SUBNETS: ipv4subnetsKeys,
	}
	marshalled, err := json.Marshal(values)
	if err != nil {
		panic(err)
	}

	builder := new(strings.Builder)
	//out, in := io.Pipe()
	//defer in.Close()
	//defer out.Close()

	fmt.Fprintln(builder, "// "+newUpdateMessage)
	fmt.Println("Rendering template...")
	err = tmpl.ExecuteTemplate(builder, "template.js", struct{ INPUTS string }{INPUTS: string(marshalled)})
	if err != nil {
		panic(err)
	}
	marshalled = nil
	values = nil
	ipv4Map = nil
	hostnamesMap = nil
	ipv4subnetsKeys = nil
	runtime.GC()

	fmt.Println("Getting README...")
	response = getOrDie(REPO_URL + "/readme/")
	text, err = ioutil.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}
	response.Body.Close()
	readme := &struct {
		Sha  string
		Path string
	}{}
	json.Unmarshal(text, readme)

	type gitFile struct {
		Path    string `json:"path"`
		Mode    string `json:"mode"`
		Type    string `json:"type"`
		Content string `json:"content,omitempty"`
		Sha     string `json:"sha,omitempty"`
	}

	body := &struct {
		Tree []gitFile `json:"tree"`
	}{
		Tree: make([]gitFile, 2),
	}
	body.Tree[0] = gitFile{
		Path:    "anticensority.pac",
		Mode:    "100644",
		Type:    "blob",
		Content: builder.String(),
	}
	body.Tree[1] = gitFile{
		Path: readme.Path,
		Mode: "100644",
		Type: "blob",
		Sha:  readme.Sha,
	}
	marshalled, err = json.Marshal(body)
	if err != nil {
		panic(err)
	}
	builder = nil
	body = nil
	readme = nil
	runtime.GC()

	doOrDie := func(method, url string, payload []byte) *http.Response {

		fmt.Println(method+"ing to", url)
		req, err := http.NewRequest(method, url, bytes.NewReader(payload))
		if err != nil {
			panic(err)
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+GH_TOKEN)
		response, err = http.DefaultClient.Do(req)
		if err != nil {
			panic(err)
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			fmt.Println("Negative status code: " + strconv.Itoa(response.StatusCode) + ". For url: " + url)
			fmt.Println(response.Body)
			panic(method + " failed.")
		}
		fmt.Println(method + "ed.")
		return response
	}
	response = doOrDie("POST", REPO_URL+"/git/trees", marshalled)
	text, err = ioutil.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}
	response.Body.Close()
	tree := &struct {
		Sha string
	}{}
	json.Unmarshal(text, tree)
	marshalled = nil
	response = nil
	runtime.GC()

	commit := &GhCommit{
		Message: newUpdateMessage,
		Tree:    tree.Sha,
	}
	marshalled, err = json.Marshal(commit)
	if err != nil {
		panic(err)
	}
	response = doOrDie("POST", REPO_URL+"/git/commits", marshalled)
	text, err = ioutil.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}
	response.Body.Close()
	patch := &struct {
		Sha   string `json:"sha"`
		Force bool   `json:"force,omitempty"`
	}{}
	json.Unmarshal(text, patch)
	patch.Force = true
	marshalled, err = json.Marshal(patch)
	if err != nil {
		panic(err)
	}
	response = doOrDie("PATCH", REPO_URL+"/git/refs/heads/master", marshalled)
	response.Body.Close()
	fmt.Println("Done.")
}

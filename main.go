package main

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"io"
	"bufio"
	"os"
	"strings"
	"sort"
	"runtime"
	"strconv"
	"io/ioutil"
	"regexp"

	"text/template"
	"encoding/json"

	"net"
	"bytes"
	"encoding/binary"

	"golang.org/x/text/transform"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/net/idna"
)

type blockProvider struct {
	urls []string
	rssUrl string
}

var blockProviders = []blockProvider{
	blockProvider {
		urls: []string{
			"https://sourceforge.net/p/z-i/code-0/HEAD/tree/dump.csv?format=raw",
			"https://svn.code.sf.net/p/z-i/code-0/dump.csv",
		},
		rssUrl: "https://sourceforge.net/p/z-i/code-0/feed",
	},
	blockProvider {
		urls: []string{
			"https://raw.githubusercontent.com/zapret-info/z-i/master/dump.csv",
		},
		rssUrl: "https://github.com/zapret-info/z-i/commits/master.atom",
	},
	blockProvider {
		urls: []string{
			"https://www.assembla.com/spaces/z-i/git/source/master/dump.csv?_format=raw",
		},
		rssUrl: "https://app.assembla.com/spaces/z-i/stream.rss",
	},
}

var get = func (url string) (*http.Response, error) {

	response, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return response, fmt.Errorf("Negative status code: " + strconv.Itoa(response.StatusCode))
	}
	return response, nil
}
var getOrDie = func (url string) *http.Response {

	response, err := get(url)
	if err != nil {
		panic(err)
	}
	return response
}

type GhCommits []struct{
	Commit struct{
		Message string
	}
}

func main() {

	GH_REPO := os.Getenv("GH_REPO")
	GH_TOKEN := os.Getenv("GH_TOKEN")
	if GH_REPO == "" || GH_TOKEN == "" {
		panic("Provide GH_REPO and GH_TOKEN environment variables!")
	}
	REPO_URL := "https://api.github.com/repos/" + GH_REPO
	response := getOrDie(REPO_URL + "/commits")
	text, err := ioutil.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}
	response.Body.Close()
	commits := &GhCommits{}
	json.Unmarshal(text, commits)
	lastUpdateMessage := (*commits)[0].Commit.Message
	var newUpdateMessage string

	updatedRegexp := regexp.MustCompile(`Updated: \d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d [+-]0000`)

	var bestProvider *blockProvider = nil
	for _, provider := range blockProviders {
		response := getOrDie(provider.rssUrl)
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

	response = getOrDie("https://bitbucket.org/ValdikSS/antizapret/raw/master/ignorehosts.txt")
	fmt.Println("Downloaded ingoredhosts.")

	ignoredHostnames := make(map[string]bool)
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		ignoredHostnames[scanner.Text()] = true
	}
	response.Body.Close()
	fmt.Println("Parsed ingoredhosts.txt.")

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

	line, err := csvIn.ReadString('\n')
	if err != nil {
	  panic(err)
	}

	reader := csv.NewReader(transform.NewReader(csvIn, charmap.Windows1251.NewDecoder()))
	reader.Comma = ';'
	reader.FieldsPerRecord = 6
	idna := idna.New()
	hostnames   := make(map[string]bool)
	ipv4        := make(map[string]bool)
	ipv4subnets := make(map[string]bool)
	ipv6        := make(map[string]bool)
	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			panic(err)
		}
		ips := strings.Split(record[0], " | ")
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
		hostnamesSlice := strings.Split(record[1], " | ")
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
				hostnames[hostname] = true
			}
		}
	}
	response.Body.Close()
	response = nil
	fmt.Println("Parsed csv.")
	runtime.GC()

	// Converts IP mask to 16 bit unsigned integer.
	addrToInt := func (in []byte) int {

		//var i uint16
		var i int32
		buf := bytes.NewReader(in)
		err := binary.Read(buf, binary.BigEndian, &i)
		if err != nil {
			panic(err)
		}
		return int(i)
	}
	getSubnets := func (m map[string]bool) [][]int {

		keys := make([][]int, len(m))
		i := 0
		for maskedNet := range m {
			_, mask, err := net.ParseCIDR(maskedNet)
			if err != nil {
				panic(err)
			}
			keys[i] = []int{ addrToInt([]byte(mask.IP)), addrToInt([]byte(mask.Mask)) }
			i++
		}
		return keys
	}
	getOptimizedMap := func (m map[string]bool) map[int]string {

		opt := make(map[int][]string)
		for key := range m {
			length := len(key)
			if opt[length] == nil {
				opt[length] = []string{ key }
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
	hostnamesMap := getOptimizedMap(hostnames)

	ipv4 = nil
	ipv6 = nil
	ipv4subnets = nil
	hostnames = nil
	runtime.GC()
	fmt.Println("Opening template...")

	tmpl, err := template.ParseFiles("./template.js")
	if err != nil {
		panic(err)
	}
	values := &struct {
		IPS map[int]string
		HOSTNAMES map[int]string
		MASKED_SUBNETS [][]int
	}{
		IPS: ipv4Map,
		HOSTNAMES: hostnamesMap,
		MASKED_SUBNETS: ipv4subnetsKeys,
	}
	result, err := json.Marshal(values)
	if err != nil {
		panic(err)
	}

	//builder := new(strings.Builder)
	out, in := io.Pipe()
	defer in.Close()
	defer out.Close()
	fmt.Fprintln(in, "// " + newUpdateMessage)

	fmt.Println("Rendering template...")
	err = tmpl.ExecuteTemplate(in, "template.js", struct { INPUTS string }{ INPUTS: string(result) })
	if err != nil {
		panic(err)
	}

	os.Exit(0)
	req, err := http.NewRequest("POST", REPO_URL + "/contents/anticensority.pac", out)
	if err != nil {
		panic(err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer " + GH_TOKEN)
	response, err = http.DefaultClient.Do(req)
	defer response.Body.Close()
	if err != nil {
		panic(err)
	}
	
}

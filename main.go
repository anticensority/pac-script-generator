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

	"text/template"
	"encoding/json"

	"net"
	"bytes"
	"encoding/binary"

	"golang.org/x/text/transform"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/net/idna"
)

// line() reports the byte offset of the beginning of the Nth line in a file.
//func getALine(in io.Reader) (string, error) {

//	var offset int64
//	var builder strings.Builder
//	nlines := 1

//	line := 0
//	for buf := make([]byte, 1); ; {
//		if line == nlines {
//			break
//		}
//		nbytes, err := in.Read(buf)
//		if err != nil {
//			return "", err
//		}
//		offset += int64(nbytes)

//		if buf[0] == '\n' {
//			line++
//		} else {
//			builder.Write(buf)
//		}
//	}
//	if line != nlines {
//		return "", fmt.Errorf("could not find target line")
//	}
//	in.Seek(offset, 0)
//	return builder.String(), nil
//}

func main() {

	response, err := http.Get("https://bitbucket.org/ValdikSS/antizapret/raw/master/ignorehosts.txt")
	if err != nil || response.StatusCode != http.StatusOK {
		panic(err)
	}
	fmt.Println("Downloaded ingoredhosts.")

	ignoredHostnames := make(map[string]bool)
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		ignoredHostnames[scanner.Text()] = true
	}
	response.Body.Close()
	fmt.Println("Parsed ingoredhosts.txt.")

	//nxdomain, err := os.Open("./nxdomain.txt")
	//if err != nil {
	//	panic(err)
	//}
	//defer nxdomain.Close()

	response, err = http.Get("https://raw.githubusercontent.com/zapret-info/z-i/master/nxdomain.txt")
	if err != nil || response.StatusCode != http.StatusOK {
		panic(err)
	}
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

	response, err = http.Get("https://raw.githubusercontent.com/zapret-info/z-i/master/dump.csv")
	if err != nil || response.StatusCode != http.StatusOK {
		panic(err)
	}
	csvIn := bufio.NewReader(response.Body)
	fmt.Println("Downloaded csv.")

	//file, err := os.Open("./dump.csv")
	//if err != nil {
	//	panic(err)
	//}
	//defer file.Close()

	//line, err := getALine(csvIn)
	line, err := csvIn.ReadString('\n')
	if err != nil {
	  panic(err)
	}
    fmt.Println(line)

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
	err = tmpl.ExecuteTemplate(os.Stdout, "template.js", struct { INPUTS string }{ INPUTS: string(result) })
	if err != nil {
		panic(err)
	}
}

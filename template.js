'use strict';
// Version: 0.3

if (/*@cc_on!@*/!1) { // Is IE?
  throw new TypeError('https://rebrand.ly/ac-anticensority');
}

const TOR_PROXIES = 'SOCKS5 localhost:9150; SOCKS5 localhost:9050; DIRECT';
const PROXY_STRING = TOR_PROXIES;

const inputs = {{.INPUTS}};
const maskedAddrMaskAddrPairs = inputs.MASKED_SUBNETS;
const ips = inputs.IPS;
const hostnames = inputs.HOSTNAMES;

function ifFoundByBinaryInString(sortedArrayJoined, target) {

  const targetLen = target.length;
  let istart = 0;
  let iend = (sortedArrayJoined.length / targetLen) - 1;

  let imid, offset, newWord;
  while (istart < iend) {
    imid = (istart + iend) >>> 1;
    offset = imid * targetLen;
    newWord = sortedArrayJoined.substring( offset, offset + targetLen );
    if (target > newWord) {
      istart = imid + 1;
    } else {
      iend = imid;
    }
  }

  offset = iend * targetLen;
  return sortedArrayJoined.substring( offset, offset + targetLen ) === target;

}

function areSubsCensored(hostname) {

  let x = hostname.lastIndexOf('.');
  do {
    x = hostname.lastIndexOf('.', x - 1);

    const sub = hostname.substring(x + 1);
    if(ifFoundByBinaryInString(hostnames[sub.length] || '', sub)) {
      return true;
    }
  } while(x > -1);
  return false;

}

function isCensoredByMaskedIp(ip) {

  const ipAddr = convert_addr(ip);

  for (const pair of maskedAddrMaskAddrPairs) {
    const maskedAddr  = pair[0];
    const maskAddr = pair[1];
    if((ipAddr & maskAddr) === maskedAddr) {
      return true;
    }
  }
  return false;

}

function FindProxyForURL(url, hostname) {

  let ifByHost = false;
  let ifByMaskedIp = false;
  // Remove last dot.
  if (hostname[hostname.length - 1] === '.') {
    hostname = hostname.replace(/\.+$/g, '');
  }
  if (hostname[0] === '.') {
    // Yes, it's possible, e.g. `fetch(https://...google.com)`.
    // `fetch(https://.)` should fail though.
    hostname = hostname.replace(/^\.+/g, '');
  }

  if (dnsDomainIs(hostname, '.onion')) {
    return TOR_PROXIES;
  }

  return (function isCensored(){

    ifByHost = areSubsCensored(hostname);
    if (ifByHost) {
      return true;
    }

    const ip = dnsResolve(hostname);
    if (ip) {
      if (ifFoundByBinaryInString(ips[ip.length] || '', ip)) {
        return true;
      }
      ifByMaskedIp = isCensoredByMaskedIp(ip);
      if (ifByMaskedIp) {
        return true;
      };
    }

    return false;

  })() ? PROXY_STRING : 'DIRECT';

}

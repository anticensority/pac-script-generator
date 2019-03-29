'use strict';

const Punycode = require('punycode');
const Logger = require('./logger');
const Utils = require('./utils');
const Proxies = require('./proxies');
const Algo = require('./algo');

async function fetchIgnoredHostsAsync() {

  var url = 'https://bitbucket.org/ValdikSS/antizapret/raw/master/ignorehosts.txt';
  var res = await Utils.fetch(url);

  if ( res.ifOk ) {
    return { content: res.content.trim().split(/\s*\r?\n\s*/g), ifOk: true };
  }
  return { error: new Error('Failed to fetch or get ignoredhosts. ResponseCode: ' + res.code), ifOk: false };

}

async function fetchCsvAsync(urls) {

  var url;
  var ifOk = false;
  do {
    url = urls.shift();
    var res = await Utils.fetch(url, 'Windows-1251');
    var code = res.code;
    var ifOk = res.ifOk;
    if ( ifOk ) {
      Logger.log('Fetched from ' + url);
      break;
    }
    Logger.log('Fetching failed for ' + url + ' Code:' + code);
  } while(urls.length);

  if (!ifOk)
    return {
      error: new Error("Can't fetch dump.csv from mirrors!")
    };

  return {
    content: res.content
  };

}

module.exports.generatePacScriptAsync = async (sources) => {

  var csv;
  var source;
  for(var i = 0; i < sources.length; ++i) {
    source = sources[i];
    csv = await fetchCsvAsync(source.urls);
    if (!csv.error) {
      break;
    }
  }
  if (csv.error) {
    return csv;
  }
  const content = await generatePacFromStringAsync(csv.content);
  return {
    content,
    date: source.date,
    dateString: source.dateString,
  };

}

//==============GENERATE-PACS.JS============================

async function generatePacFromStringAsync(input) {

  //const typeToProxyString = await Proxies.getProxyStringAsync();
  Logger.log('Generate pac from script...');

  var ipsObj   = {};
  var hostsObj = {
    // Extremism:
    'pravdabeslana.ru': true,
    // Custom hosts
    'archive.org': true,
    'bitcoin.org': true,
    // LinkedIn
    'licdn.com': true,
    'linkedin.com': true,
    // Based on users complaints:
    'koshara.net': true,
    'koshara.co': true,
    'new-team.org': true,
    'fast-torrent.ru': true,
    'pornreactor.cc': true,
    'joyreactor.cc': true,
    'nnm-club.name': true,
    'rutor.info': true,
    'free-rutor.org': true,
    // Rutracker complaints:
    "static.t-ru.org": true,
    "rutrk.org": true,

    "nnm-club.ws": true,
    "lostfilm.tv": true,
    "e-hentai.org": true,
    "deviantart.net": true, // https://groups.google.com/forum/#!topic/anticensority/uXFsOS1lQ2M
  };
  var ignoredHosts = {
    'anticensority.tk': true,
  };

  var res = await fetchIgnoredHostsAsync();
  if (res.content) {
    res.content.push('pro100farma.net\\stanozolol\\');
    for(var i in res.content) {
      var host = res.content[i];
      ignoredHosts[host] = true;
    }
  }
  Logger.log('Ignored hosts added.');

  // TREE LOGIC starts.
  const treeRoot = {};
  function addToTree(host) {

    const rDoms = host.split('.').reverse();
    const lastDom = rDoms.pop();
    var treeTip = treeRoot;
    for(var i in rDoms) {
      var dom = rDoms[i];
      if(treeTip[dom] === 'finish') {
        // We are a sub of a blocked domain.
        return;
      }
      treeTip[dom] = treeTip[dom] || {};
      treeTip = treeTip[dom];
    }
    treeTip[lastDom] = 'finish';

  }

  for(host in hostsObj) {
    addToTree(host);
  }

  function removeFromTreeRec(treeTip, rDoms) {

    const nextDom = rDoms.shift();
    if (!rDoms.length) {
      if(nextDom) {
        delete treeTip[nextDom];
      }
      return;
    }
    const nextTip = treeTip[nextDom];
    if (!nextTip || nextTip === 'finish') {
      return;
    }
    removeFromTreeRec(nextTip, rDoms);
    if ( !Object.keys(nextTip).length ) {
      delete treeTip[nextDom];
    }

  }
  function removeFromTree(host) {

    const rDoms = host.split('.').reverse();
    removeFromTreeRec(treeRoot, rDoms);

  }

  function treeToArrayRec(tree) {

    var res = [];
    for(var dom in tree) {
      var child = tree[dom];
      if (child === 'finish') {
        res.push(dom);
        continue;
      }
      Array.prototype.push.apply(
        res,
        treeToArrayRec(child).map(function(sub) { return sub + '.' + dom; })
      );
    }
    return res;

  }

  function treeToObj() {

    const arr = treeToArrayRec(treeRoot);
    const res = {};
    for(var i in  arr) {
      var key = arr[i];
      res[key] = true;
    }
    return res;

  }
  // TREE LOGIC ends.

  const ipToMaskInt = {};
  const columnsSep = ';';
  const valuesSep = /\s*\|\s*/g;

  Logger.log('Splitting input...');
  var lines = input.split('\n');
  const remoteUpdated = lines[0].trim();
  Logger.log('For each line..');
  const ipv4v6Re = /^(?:(?:[0-9]{1,3}\.){3}[0-9]{1,3}|(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4})$/i;
  for( var ii = 1; ii < lines.length; ++ii ) {

    var line = lines[ii].trim();
    if (!line) {
      continue;
    }
    var values = line.split( columnsSep );
    var newIps    = values.shift().split( valuesSep )
      .filter((ip) => ip);
    var newHosts  = values.shift().split( valuesSep )
      .filter((host) => host)
      .map( function(h) { return Punycode.toASCII( h.replace(/\.+$/g, '').replace(/^\*\./g, '').replace(/^www\./g, '') ); } );
    var newUrls   = values.shift().split( valuesSep )
      .filter((url) => url);
    // const ifDomainless = newHosts.length === 0 && newUrls.length === 0 || newIps.toString() === newHosts.toString();
    // if (ifDomainless) {
      newIps.forEach( function (ip)   {

        ip = ip.trim();
        if (!ip) {
          return;
        }
        if (ipv4v6Re.test(ip)) {
          ipsObj[ip] = true;
        } else {
          const parts = ip.split('/');
          const addr = parts[0];
          if (!( parts.length === 2 && ipv4v6Re.test(addr) )) {
            throw new Error('Can\'t parse ip:' + ip);
          }
          const mask = parts[1];
          ipToMaskInt[addr] = parseInt(mask);
        }

      });
    // } else {
      newHosts.forEach( function (host) {

        host = host.trim();
        if (!host) {
          return;
        }
        if (ipv4v6Re.test(host)) {
          ipsObj[host] = true;
        }
        else {
          addToTree(host);
        }

      });
    // }

  };
  [
    '104.18.52.38',
    '104.18.53.38',
  ].forEach((ip) => { delete ipsObj[ip]; })
  Logger.log('Done.');

  // MASKS LOGIC starts.

  // Copied from Chromium sources.
  function convert_addr(ipchars) {
    var bytes = ipchars.split('.');
    var result = ((bytes[0] & 0xff) << 24) |
                 ((bytes[1] & 0xff) << 16) |
                 ((bytes[2] & 0xff) <<  8) |
                  (bytes[3] & 0xff);
    return result;
  }

  const maskedAddrMaskAddrPairs = [];

  for (const blockedIp in ipToMaskInt) {
    const pat  = convert_addr(blockedIp);
    const cidrInt = ipToMaskInt[blockedIp];
    const mask = cidrInt && -1 << (32 - cidrInt);
    const maskedAddr = pat & mask;
    maskedAddrMaskAddrPairs.push([maskedAddr, mask]);
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

  for(var ip in ipsObj) {
    if (isCensoredByMaskedIp(ip)) {
      delete ipsObj[ip];
    }
  }
  // MASKS LOGIC ends.

  for(var host in ignoredHosts) {
    removeFromTree(host);
  }

  hostsObj = treeToObj();

  const template = function() {
__START__;
'use strict';
/*
Version: 0.2
__SUCH_NAMES__ are template placeholders that MUST be replaced for the script to work.
*/

if (__IS_IE__()) {
  throw new TypeError('https://rebrand.ly/ac-anticensority');
}

//const HTTPS_PROXIES = '__HTTPS_PROXIES__'; //'HTTPS proxy.antizapret.prostovpn.org:3143; ';
//const PROXY_PROXIES = '__PROXY_PROXIES__'; //'PROXY proxy.antizapret.prostovpn.org:3128; ';
//const PROXY_STRING  = HTTPS_PROXIES + PROXY_PROXIES + 'DIRECT';

const TOR_PROXIES = 'SOCKS5 localhost:9150; SOCKS5 localhost:9050; DIRECT';
const PROXY_STRING = TOR_PROXIES;

__MASKED_DATA__;
__DATA_EXPR__;
__REQUIRED_FUNS__;

function FindProxyForURL(url, host) {

  let ifByHost = false;
  let ifByMaskedIp = false;
  // Remove last dot.
  if (host[host.length - 1] === '.') {
    host = host.substring(0, host.length - 1);
  }
  __MUTATE_HOST_EXPR__;

  if (host.endsWith('.onion')) {
    return TOR_PROXIES;
  }

  return (function isCensored(){

    ifByHost = __IS_CENSORED_BY_HOST_EXPR__;
    if (ifByHost) {
      return true;
    }

    const ip = dnsResolve(host);
    if (ip) {
      if (__IS_CENSORED_BY_IP_EXPR__) {
        return true;
      }
      ifByMaskedIp = __IS_CENSORED_BY_MASKED_IP_EXPR__;
      if (ifByMaskedIp) {
        return true;
      };
    }

    return false;

  })() ? PROXY_STRING : 'DIRECT';

}
__END__;
  };

  function stringifyCall() {
    var fun = arguments[0];
    var args = [].slice.call( arguments, 1 )
      .map( function(a) { return typeof a !== 'string' ? JSON.stringify(a) : a; } ).join(', ');
    return '(' + fun + ')(' + args + ')';
  }

  const ipsArr = Object.keys(ipsObj).reduce(function (acc, ip) {

    acc.push(ip);
    return acc;

  }, []);

  const hostsArr = Object.keys(hostsObj).reduce(function (acc, host) {

    acc.push(host);
    return acc;

  }, []);


  const dataExpr = Algo.generate.dataExpr(hostsArr, ipsArr);

  const requiredFunctions = Algo.requiredFunctions || [];
  requiredFunctions.push(
    isCensoredByMaskedIp,
  );

  return '// From repo: ' + remoteUpdated.toLowerCase() + '\n' +
    template.toString()
    .replace(/^[\s\S]*?__START__;\s*/g, '')
    .replace(/\s*?__END__;[\s\S]*$/g, '')
    .replace(/^ {4}/gm, '')
    .replace('__MASKED_DATA__;', `const maskedAddrMaskAddrPairs = ${JSON.stringify(maskedAddrMaskAddrPairs)};\n`)
    .replace('__DATA_EXPR__;', dataExpr)
    .replace('__REQUIRED_FUNS__;', requiredFunctions.join(';\n') + ';\n')
    .replace('__MUTATE_HOST_EXPR__;', '')
    .replace('__IS_IE__()', '/*@cc_on!@*/!1')
    //.replace('__HTTPS_PROXIES__', typeToProxyString.HTTPS || ';' )
    //.replace('__PROXY_PROXIES__', typeToProxyString.PROXY || ';' )
    .replace('__IS_CENSORED_BY_MASKED_IP_EXPR__', 'isCensoredByMaskedIp(ip)')
    .replace('__IS_CENSORED_BY_IP_EXPR__', Algo.generate.isCensoredByIpExpr() )
    .replace('__IS_CENSORED_BY_HOST_EXPR__', Algo.generate.isCensoredByHostExpr() );

}

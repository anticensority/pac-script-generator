'use strict';

module.exports = (function() {

  var TYPE_TO_PROXIES = {

    HTTPS: [
      {
        host: 'proxy.antizapret.prostovpn.org',
        port: 3143
      }/*,
      {
      host: 'gw2.anticenz.org',
      port: 443
      }*/
    ],
    PROXY: [
      {
        host: 'proxy.antizapret.prostovpn.org',
        port: 3128
      }/*,
      {
      host: 'gw2.anticenz.org',
      port: 8080
      }*/
    ]

  };

  function getIpsFor(host) {

    const typeToIps = { 1: [], 28: []};
    for(var type in typeToIps) {

      var res = utils.fetch('https://dns.google.com/resolve?type=' + type + '&name=' + host);
      var data = '';
      if (res.ifOk) {
        var json = res.content;
        data = JSON.parse(json);
      }
      if (!res.ifOk || data.Status || !data.Answer) {
        Logger.log('DNS not ok for: ' + type + ' ' + host + ' ' + res.code + ' ' + JSON.stringify(data));
        continue;
      }
      data.Answer
      .filter( function(record) { return record.type in typeToIps } )
      .forEach( function(record) {

        var ip = record.data;
        if (type === '28') {
          ip = '[' + ip + ']';
        }
        typeToIps[type].push( ip );

      });

    };
    return { ifOk: typeToIps[1].length, content: typeToIps };

  }

  function getProxyString() {

    var httpsStr = '';
    var proxyStr = '';
    var ipStr = '';

    TYPE_TO_PROXIES.HTTPS.forEach( function(sproxy) {

      httpsStr += 'HTTPS ' + sproxy.host + ':' + sproxy.port + '; ';

    });

    TYPE_TO_PROXIES.PROXY.forEach( function(proxy) {

      proxyStr += 'PROXY ' + proxy.host + ':' + proxy.port + '; ';
      var res = utils.backedUp(getIpsFor, 'proxy_ips_' + proxy.host)(proxy.host);
      if (!res.ifOk) {
        Logger.log('Failed to get ips for: ' + proxy.host);
        return;
      }
      proxy.ips = res.content;
      ipStr += proxy.ips[1].concat(proxy.ips[28]).map( function(ip) { return 'PROXY ' + ip + ':' + proxy.port; } ).join('; ') + '; ';

    });
    return {
      HTTPS: httpsStr,
      PROXY: proxyStr + ipStr
    };

  };

  return {
    getProxyString: getProxyString,
  };

})();

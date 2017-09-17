'use strict';

module.exports = (function() {

  function ifFoundByBinaryInString(sortedArrayJoined, target) {

    var targetLen = target.length;
    var istart = 0;
    var iend = (sortedArrayJoined.length / targetLen) - 1;

    var imid, offset, newWord;
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

  function toLenToStr(words) {

    const lenToArr = words.reduce(function (acc, word, i) {

      acc[word.length] = acc[word.length] || [];
      acc[word.length].push(word);
      return acc;

    }, {});
    const lenToStr = Object.keys(lenToArr).reduce(function (acc, len) {

      acc[len] = lenToArr[len].sort().join('');
      return acc;

    }, {});
    return lenToStr;

  };

  function generateDataExpr(hostsArr, ipsArr) {

    const ipsJson = JSON.stringify( toLenToStr(ipsArr) );
    const hostsJson = JSON.stringify( toLenToStr(hostsArr) );

    return '' +
      'const ips = ' + ipsJson + ';\n' +
      'const hosts = ' + hostsJson + ';\n';

  }

  function areSubsCensored(host) {

    var x = host.lastIndexOf('.');
    do {
      x = host.lastIndexOf('.', x - 1);

      var sub = host.substring(x + 1);
      if(ifFoundByBinaryInString(hosts[sub.length] || '', sub)) {
        return true;
      }
    } while(x > -1);
    return false;

  }

  function generateIsCensoredByIpExpr(/*ips, indent*/) {

    return "ifFoundByBinaryInString(ips[ip.length] || '', ip)";

  }

  function generateIsCensoredByHostExpr(/*hosts, indent*/) {

    return 'areSubsCensored(host)';

  }

  return {
    requiredFunctions: [ifFoundByBinaryInString, areSubsCensored],
    generate: {
      dataExpr: generateDataExpr,
      isCensoredByHostExpr: generateIsCensoredByHostExpr,
      isCensoredByIpExpr: generateIsCensoredByIpExpr,
    }
  };

})();


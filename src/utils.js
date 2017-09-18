'use strict';

const Fetch = require('node-fetch');

var Utils = {};
module.exports = Utils;

Utils.mandatory = function mandatory () {

  throw new TypeError('Missing required argument. Be explicit if you swallow errors.');

};

Utils.ifSuccessfulCode = (status) =>
  status >= 200 && status < 300 || status === 304;

Utils.fetch = async function UtilsFetch(url, encoding) {

  const res = await Fetch(url);
  const code = res.status;
  const text = await res.text();
  const result = {
    response: {
      getResponseCode: () => code,
      getContentText: () => text,
    },
    code,
    ifOk: Utils.ifSuccessfulCode(code),
  };
  if( result.ifOk ) {
    result.content = text;
  }
  return result;

};

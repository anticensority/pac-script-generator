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
  const result = {
    ifOk: Utils.ifSuccessfulCode(code),
    code,
    stream: res.body,
    getContentTextAsync: async () => await res.text(),
  };
  return result;

};

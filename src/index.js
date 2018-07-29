'use strict';

const Assert = require('assert');
Assert(process.env.ROLLBAR_TOKEN, 'Provide Rollbar token!');

const Rollbar = require('rollbar');
const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_TOKEN,
  captureUncaught: true,
  captureUnhandledRejections: true,
});

const Publisher = require('./publisher');

let ifForce = false;
const args = process.argv.slice(2);
if (args.length) {
  Assert(args.length === 1);
  const a = args.shift();
  Assert(a === '--force');
  ifForce = true;
}

Publisher.updatePacScriptAsync(ifForce);

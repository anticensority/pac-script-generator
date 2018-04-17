'use strict';

const Assert = require('assert');
const Airbrake = require('airbrake-js')

const AB_PROJECT_ID = process.env.AIRBRAKE_PROJECT_ID;
const AB_API_KEY = process.env.AIRBRAKE_API_KEY;

Assert(AB_PROJECT_ID && AB_API_KEY, 'Provide Airbrake credentials!');

const airbrake = new Airbrake({
  projectId: AB_PROJECT_ID,
  projectKey: AB_API_KEY,
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

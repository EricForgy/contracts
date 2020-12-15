#!/usr/bin/env node

/* This script generates the root contract index based on the contents of build/contracts */

const fs = require('fs')
const glob = require('glob')
const path = require('path')
const git = require('git-last-commit')

const projectDir = path.join(__dirname, '..')
const packageJsonFile = path.join(projectDir, 'package.json')
const releaseConfigFile = path.join(projectDir, 'releaseConfig.json')
const versionInfoContract = path.join(projectDir, 'contracts', 'VersionInfo.sol')

const isReleaseBranch = process.env.CIRCLE_BRANCH === 'release'
const pullRequestUrl = process.env.CIRCLE_PULL_REQUEST
const isForTesting = !!process.env.TEST

let pullRequestNum
if (pullRequestUrl) {
  pullRequestNum = pullRequestUrl.substr(pullRequestUrl.lastIndexOf('/') + 1)
}

const buildNum = process.env.CIRCLE_BUILD_NUM

async function main () {
  const ci = await new Promise((resolve, reject) => {
    git.getLastCommit(function (err, commit) {
      if (err) return reject(err)
      resolve(commit)
    })
  })

  const releaseInfo = {}

  if ((!isForTesting) && (isReleaseBranch || pullRequestNum)) {
    if (pullRequestNum) {
      releaseInfo.freshDeployment = true
      releaseInfo.extractDeployedAddresses = true
      releaseInfo.pr = true
      releaseInfo.deployRinkeby = true
      releaseInfo.npmTag = `pr${pullRequestNum}`
      releaseInfo.npmPkgVersion = `1.0.0-pr.${pullRequestNum}.build.${buildNum}`
    } else {
      releaseInfo.deployRinkeby = true
      releaseInfo.multisig = '0x52A1A89bF7C028f889Bf57D50aEB7B418c2Fc79B' // nayms rinkeby gnosis SAFE
      releaseInfo.npmTag = `latest`
      releaseInfo.npmPkgVersion = `1.0.0-build.${buildNum}`
    }

    releaseInfo.adminDappPath = releaseInfo.npmPkgVersion
  } else {
    releaseInfo.freshDeployment = true
    releaseInfo.local = true
    releaseInfo.npmTag = `local`
    releaseInfo.npmPkgVersion = `1.0.0-local.${Date.now()}`
  }
  
  releaseInfo.hash = ci.hash
  releaseInfo.date = new Date()

  fs.writeFileSync(releaseConfigFile, JSON.stringify(releaseInfo, null, 2), 'utf8')

  // update package.json
  const packageJson = require(packageJsonFile)
  packageJson.version = releaseInfo.npmPkgVersion
  fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, null, 2), 'utf8')

  // update solidity contract
  fs.writeFileSync(versionInfoContract, `pragma solidity >=0.6.7;

abstract contract VersionInfo {
  string constant public VERSION_NUM = "${releaseInfo.npmPkgVersion}";
  uint256 constant public VERSION_DATE = ${parseInt(releaseInfo.date.getTime() / 1000, 10)};
  string constant public VERSION_GITCOMMIT = "${releaseInfo.hash}";
}
`, 'utf8')

  console.log(`Release config created:

${JSON.stringify(releaseInfo, null, 2)}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(-1)
  })

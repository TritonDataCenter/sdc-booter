# booter

Repository: <git@git.joyent.com:booter.git>
Browsing: <https://mo.joyent.com/booter>
Who: Rob Gulewich
Tickets/bugs:
* for booter code:
  <https://devhub.joyent.com/jira/browse/NET>
* for zone setup or interaction with other zones:
  <https://devhub.joyent.com/jira/browse/HEAD>


# Overview

This repository contains the DHCP server and related libraries used to
boot compute nodes.  Its contents end up in the dhcpd zone on the
headnode.


# Repository

    bin/            executables to be installed in the zone
    bin/dhcpd       the actual daemon script
    build/          build artifacts
    build/node      booter ships its own copy of node (so it remains
                    independent of the dataset version)
    build/pkg       all files to be installed into the zone go here to be
                    tarred up
    deps/           git submodules get cloned here
    lib/            source files
    node_modules/   Node.js deps, installed from npm or deps/ (in the case of
                    node-sdc-clients)
    smf/manifests   SMF manifests
    test/           node-tap test suite (run with 'make test')
    tools/          miscellaneous dev/upgrade/deployment tools and data.
    dhcpd.js        the main entry point for the server


# Development

There are three useful ways to change this code:

1. Manually copy the modifications into the dhcpd zone on a headnode.

2. Build an fstar from usb-headnode, then copy it into your headnode and
perform a factory reset.  As there is no individual way to delete and
recreate the dhcpd zone, the method described in the usb-headnode README
cannot be used.

3. Build a full USB or COAL image following the instructions in the
usb-headnode README.


# TODO

Remaining work for this repo:

* jsstyling and linting
* Log using bunyan
* Add validation of config on start

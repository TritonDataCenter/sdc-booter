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
    node_modules/   Node.js deps, installed from npm
    smf/manifests   SMF manifests
    test/           nodeunit test suite (run with 'make test')
    tools/          miscellaneous dev/upgrade/deployment tools and data.
    server.js       the main entry point for the server



# Development

There are three useful ways to change this code:

1. Manually copy the modifications into the dhcpd zone on a headnode.

2. Build an fstar from usb-headnode, then copy it into your headnode and
perform a factory reset.  As there is no individual way to delete and
recreate the dhcpd zone, the method described in the usb-headnode README
cannot be used.

3. Build a full USB or COAL image following the instructions in the
usb-headnode README.


Before checking in, please run:

    make prepush

and fix any warnings or errors. Note that jsstyle will stop after the first
file with an error, so you may need to run this multiple times while fixing.


To only run the jsstyle / jslint checks:

    make prepush



# Testing

To run all tests:

    make test

To run a single test:

    ./node_modules/.bin/nodeunit --reporter=tap <test>

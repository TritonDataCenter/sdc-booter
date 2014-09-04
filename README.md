<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# sdc-booter

This repository is part of the Joyent SmartDataCenter project (SDC).  For
contribution guidelines, issues, and general documentation, visit the main
[SDC](http://github.com/joyent/sdc) project page.

This repository contains the DHCP server and related libraries used to
boot compute nodes.  Its contents end up in the dhcpd zone on the
headnode.


# Repository

    bin/            executables to be installed in the zone
    bin/dhcpd       the actual daemon script
    build/          build artifacts
        node/       booter ships its own copy of node (so it remains
                    independent of the dataset version)
    build/pkg       all files to be installed into the zone go here to be
                    tarred up
    deps/           git submodules get cloned here
    lib/            source files
    node_modules/   node.js deps, installed from npm
    smf/manifests   SMF manifests
    test/           nodeunit test suite (run with `make test`)
    tools/          miscellaneous dev/upgrade/deployment tools and data.
    server.js       the main entry point for the server


# Development

The simplest way to test modifications to this code is to manually copy
the changed files into the dhcpd zone on a headnode.

Before checking in, please run:

    make prepush

and fix any warnings or errors. Note that jsstyle will stop after the first
file with an error, so you may need to run this multiple times while fixing.

To only run the jsstyle / jslint checks:

    make check


# Testing

To run all tests:

    make test

To run a single test:

    ./node_modules/.bin/nodeunit --reporter=tap <test>

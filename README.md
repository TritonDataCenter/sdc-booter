<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2017, Joyent, Inc.
-->

# sdc-booter

This repository is part of the Joyent Triton project. See the [contribution
guidelines](https://github.com/joyent/triton/blob/master/CONTRIBUTING.md) --
*Triton does not use GitHub PRs* -- and general documentation at the main
[Triton project](https://github.com/joyent/triton) page.

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
    test/           test suite (run with `make test`)
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

    ./node_modules/.bin/tape <test>


# Configuration

Booter supports a few SAPI configuration values:

- `http_pxe_boot`: if set to `true`, allow iPXE clients to pull down their
  files via HTTP rather than TFTP
- `compute_node_default_gateway`: set this to give Compute Nodes a
  default gateway
- `dhcp_lease_time`: DHCP lease time for Compute Nodes
- `allow_missing_class_id`: booter only allows clients with class identifiers
  of "PXEClient" and "SUNW" to obtain IP addresses.  This allows clients with
  a missing class ID to also get IPs (useful for mock cloud testing).
- `chainload_grub`: In the past, the `"pxegrub"` boot loader was sent to PXE
  clients booting from the ROM of a network card.  If your system has trouble
  with the iPXE binary (`"undionly.kpxe"`) we now send to servers, you can
  revert to the legacy grub loader by setting this option to `true`.


To update any of the above values, use the SAPI tools.  For example, in the
Global Zone:

    dhcpd_svc=$(sdc-sapi /services?name=dhcpd | json -Ha uuid)
    sapiadm update $dhcpd_svc metadata.http_pxe_boot=true


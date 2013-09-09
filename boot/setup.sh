#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-
#
# Copyright (c) 2013 Joyent Inc. All rights reserved.
#

export PS4='[\D{%FT%TZ}] ${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
set -o xtrace

CONFIG_AGENT_LOCAL_MANIFESTS_DIRS=/opt/smartdc/booter

# Include common utility functions (then run the boilerplate)
source /opt/smartdc/boot/lib/util.sh
sdc_common_setup

# Cookie to identify this as a SmartDC zone and its role
mkdir -p /var/smartdc/dhcpd

# Add booter's node and bunyan to the PATH.
echo "" >>/root/.profile
echo "export PATH=\$PATH:/opt/smartdc/booter/node/bin:/opt/smartdc/booter/node_modules/.bin:/opt/smartdc/booter/bin" >>/root/.profile

echo "Finishing setup of dhcpd zone"

# All done, run boilerplate end-of-setup
sdc_setup_complete

exit 0

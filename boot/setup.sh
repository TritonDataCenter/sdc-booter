#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2016 Joyent, Inc.
#

export PS4='[\D{%FT%TZ}] ${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
set -o xtrace
set -o errexit

CONFIG_AGENT_LOCAL_MANIFESTS_DIRS=/opt/smartdc/booter

# Include common utility functions (then run the boilerplate)
source /opt/smartdc/boot/lib/util.sh
sdc_common_setup

# Setup our delegate dataset at '/data'.
#
# Use the '/data/tftpboot' subtree for the TFTP boot dir at '/tftpboot'.
# Usage of '/tftpboot' is already baked (e.g. in the dhcpd service
# 'params.filesystems'), but it is nice to use '/data' for the delegate dataset
# base to allow other things on it and to follow the same pattern in other
# Triton core services.
zfs set mountpoint=/data zones/$(zonename)/data
mkdir -p /data/tftpboot
ln -s /data/tftpboot /tftpboot
# Some parts of /tftpboot are provided by the image. Link those in:
ls -1 /opt/smartdc/booter/tftpboot/ | while read f; do
    ln -s /opt/smartdc/booter/tftpboot/$f /tftpboot/$f;
done

# Cookie to identify this as a SmartDC zone and its role
mkdir -p /var/smartdc/dhcpd

# Add booter's node and bunyan to the PATH.
echo "" >>/root/.profile
echo "export PATH=\$PATH:/opt/smartdc/booter/node/bin:/opt/smartdc/booter/node_modules/.bin:/opt/smartdc/booter/bin" >>/root/.profile

echo "Adding log rotation"
sdc_log_rotation_add amon-agent /var/svc/log/*amon-agent*.log 1g
sdc_log_rotation_add config-agent /var/svc/log/*config-agent*.log 1g
sdc_log_rotation_add registrar /var/svc/log/*registrar*.log 1g
sdc_log_rotation_add dhcpd /var/svc/log/*dhcpd*.log 1g
sdc_log_rotation_add tftpd /var/svc/log/*tftpd*.log 1g
sdc_log_rotation_setup_end

echo "Finishing setup of dhcpd zone"

# All done, run boilerplate end-of-setup
sdc_setup_complete

exit 0

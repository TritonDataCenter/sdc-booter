#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2017, Joyent, Inc.
#

export PS4='[\D{%FT%TZ}] ${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
set -o errexit
set -o pipefail
set -o xtrace

echo "Importing dhcpd manifest (default: enabled)"
/usr/sbin/svccfg import /opt/smartdc/booter/smf/manifests/dhcpd.xml

echo "Importing tftpd manifest"
/usr/sbin/svccfg import /opt/smartdc/booter/smf/manifests/tftpd.xml

echo "Enabling tftpd service"
/usr/sbin/svcadm enable network/tftpd

echo "Configuring nginx"
cp /opt/smartdc/booter/etc/nginx.conf /opt/local/etc/nginx/nginx.conf

echo "Importing nginx manifest"
/usr/sbin/svccfg import /opt/local/lib/svc/manifest/nginx.xml

echo "Enabling nginx service"
/usr/sbin/svcadm enable pkgsrc/nginx

exit 0

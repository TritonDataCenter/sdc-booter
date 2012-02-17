#!/usr/bin/bash

set -o xtrace
set -o errexit

RELEASE_TARBALL=$1
echo "Building ${RELEASE_TARBALL}"

ROOT=$(pwd)

tmpdir="/tmp/dhcpd.$$"
mkdir -p ${tmpdir}/root/opt/smartdc/booter
mkdir -p ${tmpdir}/root/opt/smartdc/bin
mkdir -p ${tmpdir}/root/tftpboot
mkdir -p ${tmpdir}/site

cp ${ROOT}/booter-service-setup ${tmpdir}/root/opt/smartdc/bin/
cp ${ROOT}/tftpboot/* ${tmpdir}/root/tftpboot/
(cd ${ROOT}; make DESTDIR=${tmpdir}/root/opt/smartdc/booter install)
(cd ${tmpdir}; tar -jcf ${ROOT}/${RELEASE_TARBALL} root site)

rm -rf ${tmpdir}

#
# Copyright (c) 2011 Joyent Inc., All rights reserved.
#

NAME=dhcpd
ROOT=$(PWD)
INSTALL=install

VMDHCP_FILES = \
	lib/action.js \
	lib/dhcp.js \
	lib/pack.js \
	lib/sprintf.js \
	bin/vmdhcp \
	bin/vmdhcpd \
	lib/vmdhcpd.js \
	node_modules/pcap/pcap.js \
	node_modules/pcap/package.json \
	node_modules/pcap/build/default/pcap_binding.node \
	node_modules/pcap/build/default/pcap_binding_1.o

DHCP_FILES = \
	dhcpd.js \
	bin/bootparams \
	bin/menu-lst \
	lib/dhcp.js \
	lib/pack.js \
	lib/sprintf.js \
	lib/mapi.js \
	lib/menulst.js \
	node_modules/resttp.js \
	node_modules/request/package.json \
	node_modules/request/main.js

.PHONY: test

ifeq ($(VERSION), "")
    @echo "Use gmake"
endif

TAR = tar

ifeq ($(TIMESTAMP),)
    TIMESTAMP=$(shell date -u "+%Y%m%dT%H%M%SZ")
endif

ASSETS_PUBLISH_VERSION := $(shell git symbolic-ref HEAD | \
      awk -F / '{print $$3}')-$(TIMESTAMP)-g$(shell \
                git describe --all --long | awk -F '-g' '{print $$NF}')

RELEASE_TARBALL=dhcpd-pkg-$(ASSETS_PUBLISH_VERSION).tar.bz2

all: pcap

update:
	git pull --rebase

pcap:
	(cd node_modules/pcap && node-waf configure clean build)

install-vmdhcpd: ensure-destdir-set pcap common-install-dirs vmdhcpd-install-dirs $(VMDHCP_FILES:%=$(DESTDIR)/%)
install-dhcpd: ensure-destdir-set common-install-dirs dhcpd-install-dirs $(DHCP_FILES:%=$(DESTDIR)/%)

ensure-destdir-set:
	@if [ -z "$(DESTDIR)" ]; then echo "Must set DESTDIR to install!"; false; fi

common-install-dirs:
	mkdir -m 0755 -p $(DESTDIR)/bin
	mkdir -m 0755 -p $(DESTDIR)/lib

vmdhcpd-install-dirs:
	mkdir -m 0755 -p $(DESTDIR)/node_modules/pcap/build/default

dhcpd-install-dirs:
	mkdir -m 0755 -p $(DESTDIR)/node_modules/request

$(DESTDIR)/%: %
	$(INSTALL) $(ROOT)/$^ $@

test:
	node_modules/nodeunit/bin/nodeunit test

clean:
	(cd node_modules/pcap && node-waf configure clean && rm -rf build)
	rm -fr dhcpd-*.tar.bz2

release: $(RELEASE_TARBALL)

$(RELEASE_TARBALL):
	TAR=$(TAR) bash package.sh $(RELEASE_TARBALL)

publish:
	@if [[ -z "$(BITS_DIR)" ]]; then \
      echo "error: 'BITS_DIR' must be set for 'publish' target"; \
      exit 1; \
    fi
	mkdir -p $(BITS_DIR)/dhcpd
	cp $(RELEASE_TARBALL) $(BITS_DIR)/dhcpd/$(RELEASE_TARBALL)


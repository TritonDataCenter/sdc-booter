#
# Copyright (c) 2011 Joyent Inc., All rights reserved.
#

DESTROOT=$(DESTDIR)/smartdc/booter
ROOT=$(PWD)

.PHONY: test

all: pcap

update:
	git pull --rebase

pcap:
	(cd node_modules/pcap && node-waf configure clean build)

install: install-dirs install-bins install-nonbins install-pcap

install-dirs:
	mkdir -m 0755 -p $(DESTROOT)/bin
	mkdir -m 0755 -p $(DESTROOT)/node_modules/pcap/build/default

install-bins:
	/usr/bin/install -m 0555 -T $(ROOT)/bin/vmdhcp $(DESTROOT)/bin/vmdhcp
	/usr/bin/install -m 0555 -T $(ROOT)/vmdhcpd.js $(DESTROOT)/vmdhcpd

install-nonbins:
	/usr/bin/install -m 0444 -T $(ROOT)/action.js $(DESTROOT)/action.js
	/usr/bin/install -m 0444 -T $(ROOT)/config.js $(DESTROOT)/config.js
	/usr/bin/install -m 0444 -T $(ROOT)/dhcp.js $(DESTROOT)/dhcp.js
	/usr/bin/install -m 0444 -T $(ROOT)/pack.js $(DESTROOT)/pack.js
	/usr/bin/install -m 0444 -T $(ROOT)/sprintf.js $(DESTROOT)/sprintf.js

install-pcap:
	/usr/bin/install -m 0444 -T $(ROOT)/node_modules/pcap/pcap.js \
		$(DESTROOT)/node_modules/pcap/pcap.js
	/usr/bin/install -m 0444 -T $(ROOT)/node_modules/pcap/package.json \
		$(DESTROOT)/node_modules/pcap/package.json
	/usr/bin/install -m 0444 -T $(ROOT)/node_modules/pcap/build/default/pcap_binding.node \
		$(DESTROOT)/node_modules/pcap/build/default/pcap_binding.node
	/usr/bin/install -m 0444 -T $(ROOT)/node_modules/pcap/build/default/pcap_binding_1.o \
		$(DESTROOT)/node_modules/pcap/build/default/pcap_binding_1.o

test:
	node_modules/nodeunit/bin/nodeunit test

clean:
	(cd node_modules/pcap && node-waf configure clean && rm -rf build)

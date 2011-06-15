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

install: pcap install-dirs install-bins install-nonbins install-pcap

install-dirs:
	mkdir -m 0755 -p $(DESTROOT)/bin
	mkdir -m 0755 -p $(DESTROOT)/lib
	mkdir -m 0755 -p $(DESTROOT)/node_modules/pcap/build/default

install-bins:
	/usr/bin/install -m 0555 -T $(ROOT)/bin/vmdhcp $(DESTROOT)/bin/vmdhcp
	/usr/bin/install -m 0555 -T $(ROOT)/bin/vmdhcpd $(DESTROOT)/bin/vmdhcpd

install-nonbins:
	/usr/bin/install -m 0444 -T $(ROOT)/lib/action.js $(DESTROOT)/lib/action.js
	/usr/bin/install -m 0444 -T $(ROOT)/lib/dhcp.js $(DESTROOT)/lib/dhcp.js
	/usr/bin/install -m 0444 -T $(ROOT)/lib/pack.js $(DESTROOT)/lib/pack.js
	/usr/bin/install -m 0444 -T $(ROOT)/lib/sprintf.js $(DESTROOT)/lib/sprintf.js
	/usr/bin/install -m 0555 -T $(ROOT)/lib/vmdhcpd.js $(DESTROOT)/lib/vmdhcpd.js

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

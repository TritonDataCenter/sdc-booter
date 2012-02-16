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
	node_modules/sdc-clients/lib/mapi.js \
	node_modules/sdc-clients/lib/ufds.js \
	node_modules/sdc-clients/lib/amon.js \
	node_modules/sdc-clients/lib/index.js \
	node_modules/sdc-clients/lib/ca.js \
	node_modules/sdc-clients/lib/cache.js \
	node_modules/sdc-clients/package.json \
	node_modules/sdc-clients/node_modules/node-uuid/uuid.js \
	node_modules/sdc-clients/node_modules/node-uuid/package.json \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/ctype/ctf.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/ctype/ctype.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/ctype/ctio.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/ctype/package.json \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/package.json \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/ber/writer.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/ber/types.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/ber/errors.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/ber/reader.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/ber/index.js \
	node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/index.js \
	node_modules/sdc-clients/node_modules/http-signature/package.json \
	node_modules/sdc-clients/node_modules/http-signature/http_signing.md \
	node_modules/sdc-clients/node_modules/http-signature/lib/util.js \
	node_modules/sdc-clients/node_modules/http-signature/lib/index.js \
	node_modules/sdc-clients/node_modules/http-signature/lib/parser.js \
	node_modules/sdc-clients/node_modules/http-signature/lib/signer.js \
	node_modules/sdc-clients/node_modules/http-signature/lib/verify.js \
	node_modules/sdc-clients/node_modules/sprintf/package.json \
	node_modules/sdc-clients/node_modules/sprintf/lib/sprintf.js \
	node_modules/sdc-clients/node_modules/restify/package.json \
	node_modules/sdc-clients/node_modules/restify/lib/index.js \
	node_modules/sdc-clients/node_modules/restify/lib/clients/json_client.js \
	node_modules/sdc-clients/node_modules/restify/lib/clients/index.js \
	node_modules/sdc-clients/node_modules/restify/lib/clients/string_client.js \
	node_modules/sdc-clients/node_modules/restify/lib/clients/http_client.js \
	node_modules/sdc-clients/node_modules/restify/lib/server.js \
	node_modules/sdc-clients/node_modules/restify/lib/request.js \
	node_modules/sdc-clients/node_modules/restify/lib/errors/http_error.js \
	node_modules/sdc-clients/node_modules/restify/lib/errors/index.js \
	node_modules/sdc-clients/node_modules/restify/lib/errors/rest_error.js \
	node_modules/sdc-clients/node_modules/restify/lib/response.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/body_parser.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/json_body_parser.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/accept.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/date.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/authorization.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/index.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/throttle.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/conditional_request.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/form_body_parser.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/audit.js \
	node_modules/sdc-clients/node_modules/restify/lib/plugins/query.js \
	node_modules/sdc-clients/node_modules/restify/lib/route.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/semver/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/semver/semver.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/semver/test.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/semver/bin/semver \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/bin/bunyan \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tools/timechild.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tools/timeguard.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tools/cutarelease.py \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tools/timesrc.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/lib/bunyan.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/memory-test.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/log4js.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/levels.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/connect-logger.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/console.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/multiprocess.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/smtp.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/hookio.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/file.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/logLevelFilter.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders/gelf.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/log4js.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/date_format.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/streams.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/layouts.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/example-connect-logger.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/log-rolling.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/retry/index.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/retry/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/retry/lib/retry.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/retry/lib/retry_operation.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/ctype/ctype.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/ctype/ctf.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/ctype/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/ctype/ctio.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/ber/reader.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/ber/errors.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/ber/writer.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/ber/index.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/ber/types.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/index.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/lib/index.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/lib/util.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/lib/signer.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/lib/parser.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/lib/verify.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/async/index.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/async/lib/async.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/async/dist/async.min.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/async/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/mime/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/mime/test.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/mime/mime.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/mime/types/node.types \
	node_modules/sdc-clients/node_modules/restify/node_modules/mime/types/mime.types \
	node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider/package.json \
	node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider/dtrace-provider.js \
	node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider/build/Release/DTraceProviderBindings.node \
	node_modules/sdc-clients/node_modules/ldapjs/lib/attribute.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/url.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/bind_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/search_reference.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/search_entry.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/compare_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/parser.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/message.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/search_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/result.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/bind_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/compare_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/search_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/del_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/ext_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/moddn_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/ext_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/unbind_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/abandon_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/add_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/abandon_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/moddn_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/del_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/unbind_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/add_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/modify_request.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/messages/modify_response.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/ext_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/ge_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/or_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/le_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/presence_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/approx_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/not_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/substr_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/equality_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/filters/and_filter.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/controls/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/controls/entry_change_notification_control.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/controls/control.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/controls/persistent_search_control.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/dn.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/schema/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/schema/transform.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/schema/search_handler.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/schema/parser.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/schema/mod_handler.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/schema/add_handler.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/dtrace.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/server.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/log_stub.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/errors/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/change.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/protocol.js \
	node_modules/sdc-clients/node_modules/ldapjs/lib/client.js \
	node_modules/sdc-clients/node_modules/ldapjs/package.json \
	node_modules/sdc-clients/node_modules/ldapjs/bin/ldapjs-modify \
	node_modules/sdc-clients/node_modules/ldapjs/bin/ldapjs-compare \
	node_modules/sdc-clients/node_modules/ldapjs/bin/ldapjs-add \
	node_modules/sdc-clients/node_modules/ldapjs/bin/ldapjs-search \
	node_modules/sdc-clients/node_modules/ldapjs/bin/ldapjs-delete \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/package.json \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/buffertools.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/build/Release/buffertools.node \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/test.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/build/Release/DTraceProviderBindings.node \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/dtrace-provider.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/dtp.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/package.json \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/lib/nopt.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/node_modules/abbrev/lib/abbrev.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/node_modules/abbrev/package.json \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/bin/nopt.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/package.json \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/ber/writer.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/ber/index.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/ber/reader.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/ber/errors.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/ber/types.js \
	node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/package.json \
	node_modules/sdc-clients/node_modules/lru-cache/package.json \
	node_modules/sdc-clients/node_modules/lru-cache/lib/lru-cache.js

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

all: pcap dtrace-provider buffertools

update:
	git pull --rebase

pcap:
	(cd node_modules/pcap && node-waf configure clean build)

dtrace-provider:
	(cd node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider && node-waf configure clean build)
	(cd node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider && node-waf configure clean build)

buffertools:
	(cd node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools && node-waf configure clean build)

install-vmdhcpd: ensure-destdir-set pcap common-install-dirs vmdhcpd-install-dirs $(VMDHCP_FILES:%=$(DESTDIR)/%)
install-dhcpd: ensure-destdir-set dtrace-provider buffertools common-install-dirs dhcpd-install-dirs $(DHCP_FILES:%=$(DESTDIR)/%)
	(cd $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/ && ln -s build/Release/buffertools.node .)
	(cd $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/ && ln -s build/Release/DTraceProviderBindings.node .)
	(cd $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider/ && ln -s build/Release/DTraceProviderBindings.node .)

ensure-destdir-set:
	@if [ -z "$(DESTDIR)" ]; then echo "Must set DESTDIR to install!"; false; fi

common-install-dirs:
	mkdir -m 0755 -p $(DESTDIR)/bin
	mkdir -m 0755 -p $(DESTDIR)/lib

vmdhcpd-install-dirs:
	mkdir -m 0755 -p $(DESTDIR)/node_modules/pcap/build/default

dhcpd-install-dirs:
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/http-signature/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/http-signature/node_modules/asn1/lib/ber
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/http-signature/node_modules/ctype
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/bin
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/lib/controls
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/lib/errors
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/lib/filters
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/lib/messages
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/lib/schema
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/asn1/lib/ber
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/build/Release
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools/build/default
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/build/Release
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider/build/default/solaris-i386
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/bin
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/ldapjs/node_modules/nopt/node_modules/abbrev/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/lru-cache/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/node-uuid
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/lib/clients
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/lib/errors
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/lib/plugins
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/async/dist
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/async/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/bin
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tmp/log4js-node/lib/appenders
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/bunyan/tools
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider/build/default/solaris-i386
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider/build/Release
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/asn1/lib/ber
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/http-signature/node_modules/ctype
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/mime/types
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/retry/lib
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/restify/node_modules/semver/bin
	mkdir -m 0755 -p $(DESTDIR)/node_modules/sdc-clients/node_modules/sprintf/lib

$(DESTDIR)/%: %
	$(INSTALL) $(ROOT)/$^ $@

test:
	node_modules/nodeunit/bin/nodeunit test

clean:
	(cd node_modules/pcap && node-waf configure clean && rm -rf build)
	rm -fr dhcpd-*.tar.bz2
	(cd node_modules/sdc-clients/node_modules/ldapjs/node_modules/buffertools && node-waf configure clean && rm -rf build .lock-wscript)
	(cd node_modules/sdc-clients/node_modules/restify/node_modules/dtrace-provider && node-waf configure clean && rm -rf build .lock-wscript)
	(cd node_modules/sdc-clients/node_modules/ldapjs/node_modules/dtrace-provider && node-waf configure clean && rm -rf build .lock-wscript)

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

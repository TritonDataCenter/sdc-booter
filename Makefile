#
# Copyright (c) 2012, Joyent, Inc. All rights reserved.
#

NAME=dhcpd

#
# Directories
#
TOP := $(shell pwd)


#
# Tools
#
TAP		:= ./node_modules/.bin/tap
NPM_FLAGS = --cache=$(TOP)/build/tmp/npm-cache

include ./tools/mk/Makefile.defs
include ./tools/mk/Makefile.node.defs
include ./tools/mk/Makefile.smf.defs


#
# Files
#
JS_FILES	:= $(shell ls *.js) $(shell find lib test -name '*.js')
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE   = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
SMF_MANIFESTS_IN = smf/manifests/dhcpd.xml.in smf/manifests/tftpd.xml.in
PKG_DIR = $(BUILD)/pkg
BOOTER_PKG_DIR = $(PKG_DIR)/root/opt/smartdc/booter
TFTPBOOT_PKG_DIR = $(PKG_DIR)/root/tftpboot/
RELEASE_TARBALL=dhcpd-pkg-$(STAMP).tar.bz2
CLEAN_FILES += ./node_modules build/pkg dhcpd-pkg-*.tar.bz2


#
# Included definitions
#
include ./tools/mk/Makefile.defs
include ./tools/mk/Makefile.node.defs
include ./tools/mk/Makefile.smf.defs


#
# Repo-specific targets
#
.PHONY: all
all: deps $(SMF_MANIFESTS) | $(TAP)
	$(NPM) rebuild

$(TAP): | $(NPM_EXEC)
	$(NPM) install

.PHONY: test
test: $(TAP)
	TAP=1 $(TAP) test/*.js


#
# Dependencies
#
.PHONY: deps
deps: | $(NPM_EXEC) deps/node-sdc-clients/.git
	$(NPM) install deps/node-sdc-clients
	$(NPM) install

deps/node-sdc-clients/.git:
	GIT_SSL_NO_VERIFY=1 git submodule update --init deps/node-sdc-clients


#
# Packaging targets
#
.PHONY: pkg
pkg: all
	rm -rf $(PKG_DIR)
	mkdir -p $(BOOTER_PKG_DIR)/smf/manifests
	mkdir -p $(TFTPBOOT_PKG_DIR)
	cp $(TOP)/tftpboot/* $(TFTPBOOT_PKG_DIR)
	cp -PR lib \
		bin \
		dhcpd.js \
		package.json \
		$(BOOTER_PKG_DIR)
	cp -P smf/manifests/*.xml $(BOOTER_PKG_DIR)/smf/manifests
	(cd $(BOOTER_PKG_DIR) && $(NPM) install --production && $(NPM) install --production $(TOP)/deps/node-sdc-clients)
	cp -PR $(NODE_INSTALL) $(BOOTER_PKG_DIR)/node
	rm $(BOOTER_PKG_DIR)/package.json
	# Clean up some dev / build bits
	find $(PKG_DIR) -name "*.pyc" | xargs rm -f
	find $(PKG_DIR) -name "*.o" | xargs rm -f
	find $(PKG_DIR) -name c4che | xargs rm -rf   # waf build file
	find $(PKG_DIR) -name .wafpickle* | xargs rm -rf   # waf build file
	find $(PKG_DIR) -name .lock-wscript | xargs rm -rf   # waf build file
	find $(PKG_DIR) -name config.log | xargs rm -rf   # waf build file

release: $(RELEASE_TARBALL)

$(RELEASE_TARBALL): pkg
	(cd $(PKG_DIR); tar -jcf $(TOP)/$(RELEASE_TARBALL) root)

publish:
	@if [[ -z "$(BITS_DIR)" ]]; then \
      echo "error: 'BITS_DIR' must be set for 'publish' target"; \
      exit 1; \
    fi
	mkdir -p $(BITS_DIR)/dhcpd
	cp $(RELEASE_TARBALL) $(BITS_DIR)/dhcpd/$(RELEASE_TARBALL)


#
# Includes
#
include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.node.targ
include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.targ

#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2019, Joyent, Inc.
#

NAME=dhcpd

#
# Directories
#

TOP := $(shell pwd)


#
# Tools
#
TAPE := ./node_modules/.bin/tape
ISTANBUL := ./node_modules/.bin/istanbul
PACK := node_modules/pack/index.js

#
# Files
#
BASH_FILES	:= bin/booter bin/dhcpd
JS_FILES	:= $(shell ls *.js) $(shell find lib test -name '*.js') bin/hn-netfile
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE   = $(JS_FILES)
JSON_FILES	:= config.json.sample package.json
JSSTYLE_FILES	 = $(JS_FILES)
SMF_MANIFESTS_IN = smf/manifests/dhcpd.xml.in smf/manifests/tftpd.xml.in
PKG_DIR = $(BUILD)/pkg
BOOTER_PKG_DIR = $(PKG_DIR)/root/opt/smartdc/booter
TFTPBOOT_PKG_DIR = $(PKG_DIR)/root/tftpboot/
RELEASE_TARBALL=dhcpd-pkg-$(STAMP).tar.gz
CLEAN_FILES += ./node_modules build/pkg
REPO_MODULES := src/node-pack
JSSTYLE_FLAGS = -o indent=4,doxygen,unparenthesized-return=0

REPO_DEPS    = $(REPO_MODULES:src/node-%=node_modules/%)
CLEAN_FILES += $(REPO_DEPS)

NODE_PREBUILT_VERSION=v4.9.0
ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_TAG=zone
	NODE_PREBUILT_IMAGE=18b094b0-eb01-11e5-80c1-175dac7ddf02
endif

# our base image is triton-origin-multiarch-15.4.1
BASE_IMAGE_UUID = 04a48d7d-6bb5-4e83-8c3b-e60a99e0f48f
BUILDIMAGE_NAME = $(NAME)
BUILDIMAGE_DESC	= SDC DHCPD
BUILDIMAGE_PKGSRC = nginx-1.10.1 tftp-hpa-5.2
AGENTS		= amon config registrar

#
# Included definitions
#
ENGBLD_USE_BUILDIMAGE	= true
ENGBLD_REQUIRE		:= $(shell git submodule update --init deps/eng)
include ./deps/eng/tools/mk/Makefile.defs
TOP ?= $(error Unable to access eng.git submodule Makefiles.)

ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.defs
	include ./deps/eng/tools/mk/Makefile.agent_prebuilt.defs
else
	NPM_EXEC :=
	NPM = npm
endif
include ./deps/eng/tools/mk/Makefile.smf.defs

#
# Repo-specific targets
#
.PHONY: all
all: $(REPO_DEPS) $(SMF_MANIFESTS) node_modules | $(TAPE) sdc-scripts src/node-pack/index.js

node_modules: package.json | $(NPM_EXEC)
	$(NPM) install

$(TAPE): node_modules

$(ISTANBUL): node_modules

.PHONY: test
test:  $(PACK) | $(TAPE) node_modules
	$(TAPE) test/*.test.js

.PHONY: coverage
coverage: $(PACK) | $(ISTANBUL) $(TAPE) node_modules
	$(ISTANBUL) cover $(TAPE) test/*.test.js

$(PACK): | node_modules
	cp -r src/node-pack node_modules/pack

# a target to make our pack module
node_modules/%: src/node-% | $(NPM_EXEC)
	$(NPM) install $<

#
# Packaging targets
#

.PHONY: pkg
pkg: all
	rm -rf $(PKG_DIR)
	mkdir -p $(BOOTER_PKG_DIR)/smf/manifests
	mkdir -p $(TFTPBOOT_PKG_DIR)
	cp $(TOP)/tftpboot/* $(TFTPBOOT_PKG_DIR)
	cp -PR bin \
		etc \
		lib \
		package.json \
		node_modules \
		server.js \
		sapi_manifests \
		$(BOOTER_PKG_DIR)
	cp smf/manifests/*.xml $(BOOTER_PKG_DIR)/smf/manifests
	(cd $(BOOTER_PKG_DIR) && $(NPM) install --production)
	cp -PR $(NODE_INSTALL) $(BOOTER_PKG_DIR)/node
	rm $(BOOTER_PKG_DIR)/package.json
	mkdir -p $(PKG_DIR)/root/opt/smartdc/boot
	cp -R $(TOP)/deps/sdc-scripts/* $(PKG_DIR)/root/opt/smartdc/boot/
	cp -R $(TOP)/boot/* $(PKG_DIR)/root/opt/smartdc/boot/
	# Clean up some dev / build bits
	find $(PKG_DIR) -name "*.pyc" | xargs rm -f
	find $(PKG_DIR) -name "*.o" | xargs rm -f
	find $(PKG_DIR) -name c4che | xargs rm -rf   # waf build file
	find $(PKG_DIR) -name .wafpickle* | xargs rm -rf   # waf build file
	find $(PKG_DIR) -name .lock-wscript | xargs rm -rf   # waf build file
	find $(PKG_DIR) -name config.log | xargs rm -rf   # waf build file

release: $(RELEASE_TARBALL)

$(RELEASE_TARBALL): pkg
	(cd $(PKG_DIR); $(TAR) -I pigz -cf $(TOP)/$(RELEASE_TARBALL) root)

publish:
	@if [[ -z "$(ENGBLD_BITS_DIR)" ]]; then \
		echo "error: 'ENGBLD_BITS_DIR' must be set for 'publish' target"; \
		exit 1; \
	fi
	mkdir -p $(ENGBLD_BITS_DIR)/dhcpd
	cp $(RELEASE_TARBALL) $(ENGBLD_BITS_DIR)/dhcpd/$(RELEASE_TARBALL)

check:: $(NODE_EXEC)


#
# Includes
#
include ./deps/eng/tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.targ
	include ./deps/eng/tools/mk/Makefile.agent_prebuilt.targ
endif
include ./deps/eng/tools/mk/Makefile.smf.targ
include ./deps/eng/tools/mk/Makefile.targ

sdc-scripts: deps/sdc-scripts/.git

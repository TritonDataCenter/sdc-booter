#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2022 Joyent, Inc.
#

NAME=dhcpd

#
# Directories
#

TOP := $(shell pwd)


#
# Tools
#
TAP := ./node_modules/.bin/tap
PACK := ./$(BUILD)/pack-0.0.1.tgz

#
# Files
#
BASH_FILES	:= bin/booter bin/dhcpd
JS_FILES	:= $(shell ls *.js) $(shell find lib test -name '*.js') bin/hn-netfile
ESLINT_FILES   = $(JS_FILES)
JSON_FILES	:= config.json.sample package.json
JSSTYLE_FILES	 = $(JS_FILES)
SMF_MANIFESTS_IN = smf/manifests/dhcpd.xml.in smf/manifests/tftpd.xml.in
PKG_DIR = $(BUILD)/pkg
BOOTER_PKG_DIR = $(PKG_DIR)/root/opt/smartdc/booter
TFTPBOOT_PKG_DIR = $(PKG_DIR)/root/tftpboot/
RELEASE_TARBALL=dhcpd-pkg-$(STAMP).tar.gz
CLEAN_FILES += ./node_modules $(BUILD)/pkg $(PACK)
REPO_MODULES := src/node-pack
JSSTYLE_FLAGS = -o indent=4,doxygen,unparenthesized-return=0

NODE_PREBUILT_VERSION=v6.17.1
ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_TAG=zone64
	NODE_PREBUILT_IMAGE=a7199134-7e94-11ec-be67-db6f482136c2
endif

# our base image is triton-origin-x86_64-21.4.0
BASE_IMAGE_UUID = 502eeef2-8267-489f-b19c-a206906f57ef
BUILDIMAGE_NAME = $(NAME)
BUILDIMAGE_DESC	= SDC DHCPD
BUILDIMAGE_PKGSRC = nginx-1.21.5 tftp-hpa-5.2
AGENTS		= amon config registrar

#
# Included definitions
#
ENGBLD_USE_BUILDIMAGE	= true
ENGBLD_REQUIRE		:= $(shell git submodule update --init deps/eng)
include ./deps/eng/tools/mk/Makefile.defs
TOP ?= $(error Unable to access eng.git submodule Makefiles.)

BUILD_PLATFORM = 20210826T002459Z

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
all: $(SMF_MANIFESTS) node_modules | $(TAP) sdc-scripts

node_modules: package.json | $(NPM_EXEC) $(PACK)
	$(NPM) install --no-save

$(TAP): | $(NPM_EXEC)
	$(NPM) install tap --no-save

.PHONY: test
test: $(NODE_EXEC) $(TAP) node_modules
	$(NODE) $(TAP) test/unit/*.test.js

.PHONY: coverage
coverage: $(NODE_EXEC) $(TAP) node_modules
	 $(NODE) $(TAP) test/**/*.test.js --coverage-report=html --no-browser

$(PACK):
	$(NPM) pack file:$(TOP)/src/node-pack
	mkdir -p $(TOP)/$(BUILD)
	mv pack-0.0.1.tgz $(TOP)/$(BUILD)/

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
	(cd $(BOOTER_PKG_DIR) && $(NPM) prune --production)
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

publish: release
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

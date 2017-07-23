#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2017, Joyent, Inc.
#

NAME =			dhcpd

#
# Directories
#

TOP :=			$(shell pwd)


#
# Files
#

#
# Some Javascript files have been included from a third party project, and
# are not presently clean from a lint or style perspective.
#
UNWASHED_FILES :=	$(wildcard lib/thirdparty/*.js)
BASH_FILES :=		bin/booter bin/dhcpd
JS_FILES :=		$(shell ls *.js) \
			$(shell find lib test -name '*.js') \
			bin/hn-netfile
JSL_CONF_NODE =		tools/jsl.node.conf
JSL_FILES_NODE =	$(filter-out $(UNWASHED_FILES),$(JS_FILES))
JSON_FILES :=		config.json.sample package.json
JSSTYLE_FILES =		$(filter-out $(UNWASHED_FILES),$(JS_FILES))
SMF_MANIFESTS_IN =	smf/manifests/dhcpd.xml.in \
			smf/manifests/tftpd.xml.in
PKG_DIR =		$(BUILD)/pkg
BOOTER_PKG_DIR =	$(PKG_DIR)/root/opt/smartdc/booter
TFTPBOOT_PKG_DIR =	$(PKG_DIR)/root/tftpboot/
RELEASE_TARBALL =	dhcpd-pkg-$(STAMP).tar.bz2
CLEAN_FILES +=		build/pkg \
			dhcpd-pkg-*.tar.bz2
JSSTYLE_FLAGS =		-o indent=4,doxygen,unparenthesized-return=0

NODEUNIT_TESTS =	$(notdir $(wildcard test/*.test.js))

NODE_PREBUILT_VERSION =	v0.10.32
ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_TAG =	zone
	NODE_PREBUILT_IMAGE =	de411e86-548d-11e4-a4b7-3bb60478632a
endif


#
# Included definitions
#

include ./tools/mk/Makefile.defs
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.defs
else
	NPM_EXEC :=
	NPM = npm
	NODE = node
endif
include ./tools/mk/Makefile.node_modules.defs
include ./tools/mk/Makefile.smf.defs


#
# Repo-specific targets
#


.PHONY: all
all: $(SMF_MANIFESTS) $(STAMP_NODE_MODULES) | sdc-scripts
	$(NPM) install

.PHONY: test
test: $(STAMP_NODE_MODULES) $(addprefix run-nodeunit.,$(NODEUNIT_TESTS))

run-nodeunit.%: test/%
	$(NODE) ./node_modules/.bin/nodeunit $^


#
# Packaging targets
#

.PHONY: pkg
pkg: all
	rm -rf $(PKG_DIR)
	mkdir -p $(BOOTER_PKG_DIR)/smf/manifests
	mkdir -p $(TFTPBOOT_PKG_DIR)
	cp $(TOP)/tftpboot/* $(TFTPBOOT_PKG_DIR)
	cp -PR \
	    bin \
	    etc \
	    lib \
	    package.json \
	    node_modules \
	    server.js \
	    sapi_manifests \
	    $(BOOTER_PKG_DIR)
	cp smf/manifests/*.xml $(BOOTER_PKG_DIR)/smf/manifests
	cd $(BOOTER_PKG_DIR) && $(NPM) install --production
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
	cd $(PKG_DIR); tar -jcf $(TOP)/$(RELEASE_TARBALL) root

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
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
endif
include ./tools/mk/Makefile.node_modules.targ
include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.targ

sdc-scripts: deps/sdc-scripts/.git

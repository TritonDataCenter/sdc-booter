# DHCP client and server

This repository contains the DHCP server and related libraries used to
boot compute nodes.  Its contents end up in the dhcpd zone on the
headnode (unless this zone has been installed on an alternate compute
node).

### Tracking and Ownership

Bugs and RFEs for this repository generally belong in the NET project if
they relate to the functionality of the DHCP server itself or its
interaction with clients.  In some cases, issues with the interaction
between the server and other services or system infrastructure should
instead be filed in the HEAD project.  At time of this writing there is
no specific component for this functionality in any project.

The primary owner of this repository's contents is:
	Rob Gulewich <robert.gulewich@joyent.com>.

### Make targets

The default (all) target rebuilds the binary Node modules.

The install-dhcpd target is used by the fs.populate script in
usb-headnode for constructing the dhcpd zone filesystem.

The install-vmdhcpd target is used to install the client components into
compute nodes.

The check and lint targets are not available; this is a bug.

### Workflow

There are three useful ways to change this code:

1. Manually copy the modifications into the dhcpd zone on a headnode.

2. Build an fstar from usb-headnode, then copy it into your headnode and
perform a factory reset.  As there is no individual way to delete and
recreate the dhcpd zone, the method described in the usb-headnode README
cannot be used.

3. Build a full USB or COAL image following the instructions in the
usb-headnode README.

### Dependency management

All Node dependencies have been installed with npm and checked into the
repository.  There are four binary modules that are rebuilt using the
default make target.

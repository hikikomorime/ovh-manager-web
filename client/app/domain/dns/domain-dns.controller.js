angular.module("controllers").controller(
    "controllers.Domain.Dns",
    class DomainDnsCtrl {
        constructor ($scope, $filter, $q, $stateParams, Alerter, Domain, User, Validator, constants) {
            this.$scope = $scope;
            this.$filter = $filter;
            this.$q = $q;
            this.$stateParams = $stateParams;
            this.Alerter = Alerter;
            this.Domain = Domain;
            this.User = User;
            this.Validator = Validator;
            this.constants = constants;
        }

        $onInit () {
            this.allowModification = false;
            this.atLeastOneDns = true;
            this.atLeastOneToRemove = true;
            this.dns = {
                original: null,
                table: null,
                activeDns: null
            };
            this.dnsStatus = {
                isHosted: null,
                isOk: null
            };
            this.isDnssecEnable = false;
            this.editMode = false;
            this.loading = {
                add: false,
                all: false,
                table: false
            };
            this.urls = {
                zoneCheck: this.constants.urls.TOOLS.ZONE_CHECK
            };

            this.$scope.$on("Domain.Dns.Reload", () => this.init());
            this.$scope.loadTable = () => this.loadTable();

            this.$q
                .all({
                    serviceInfo: this.Domain.getServiceInfo(this.$stateParams.productId),
                    user: this.User.getUser()
                })
                .then(({ serviceInfo, user }) => {
                    this.allowModification = serviceInfo && user && (serviceInfo.contactTech === user.nichandle || serviceInfo.contactAdmin === user.nichandle);
                });

            this.init();
        }

        init () {
            this.loading.all = true;
            return this.Domain
                .getSelected(this.$stateParams.productId)
                .then((domain) => {
                    this.domain = domain;
                    this.isDnssecEnable = domain.dnssecStatus === "ENABLED";
                    this.loadTable();
                })
                .catch(() => {
                    this.loading.all = false;
                });
        }

        loadTable () {
            this.loading.table = true;
            this.dns.table = [];
            return this.Domain
                .getTabDns(this.$stateParams.productId)
                .then((tabDns) => {
                    this.dns.table = tabDns;
                    this.dns.original = angular.copy(tabDns);
                    this.dns.activeDns = this.$filter("filter")(tabDns.dns, { isUsed: true, toDelete: false }).length;
                    return this.$q.all(_.map(tabDns.dns, (nameServer) => this.Domain.getNameServerStatus(this.$stateParams.productId, nameServer.id)));
                })
                .then((nameServersStatus) => {
                    if (!_.isEmpty(nameServersStatus)) {
                        this.dnsStatus.isOk = !_.some(nameServersStatus, { state: "ko" });
                        this.dnsStatus.isHosted = !_.some(nameServersStatus, { type: "external" });
                    }
                })
                .finally(() => {
                    this.loading.all = false;
                    this.loading.table = false;
                });
        }

        activeEditMode () {
            this.editMode = true;
        }

        addNewLine () {
            return this.dns.table.dns.length >= 10 || this.dns.table.dns.push({ editedHost: "", editedIp: "" });
        }

        removeLine (item) {
            _.remove(this.dns.table.dns, item);
            const filtered = _.filter(this.dns.table.dns, (currentDNS) => !currentDNS.toDelete);
            this.atLeastOneToRemove = this.dns.table.dns && filtered.length > 1;
        }

        cancelDns () {
            this.dns.table.dns = angular.copy(this.dns.original.dns);
            this.atLeastOneDns = true;
            this.atLeastOneToRemove = true;
            this.editMode = false;
        }

        checkAtLeastOneDns () {
            const filtered = _.filter(this.dns.table.dns, (currentDNS) => !currentDNS.toDelete && ((currentDNS.host && currentDNS.editedHost == null) || (currentDNS.editedHost && currentDNS.editedHost !== "")));
            this.atLeastOneDns = this.dns.table.dns && filtered.length > 0;
        }

        hostCheck (input) {
            const value = input.$viewValue;
            input.$setValidity("domain", value === "" || this.Validator.isValidDomain(value));
        }

        ipCheck (input) {
            const value = input.$viewValue;
            input.$setValidity("ip", value === "" || this.Validator.isValidIpv4(value) || this.Validator.isValidIpv6(value));
        }

        saveDns () {
            let dns = _.filter(this.dns.table.dns, (currentDNS) => currentDNS.editedHost !== "" || currentDNS.editedIp);

            if (!_.isEmpty(dns)) {
                this.loading.table = true;
                dns = _.map(dns, (d) => ({ host: d.editedHost || d.host, ip: d.editedIp || d.ip || undefined }));

                this.$q
                    .when(this.domain.managedByOvh ? this.Domain.updateNameServerType(this.$stateParams.productId, "external") : null)
                    .then(() => {
                        this.domain.managedByOvh = false;
                        return this.Domain.updateDnsNameServerList(this.$stateParams.productId, dns);
                    })
                    .then(() => this.Alerter.success(this.$scope.i18n.domain_tab_DNS_update_success, this.$scope.alerts.main))
                    .catch((err) => {
                        _.set(err, "type", err.type || "ERROR");
                        this.Alerter.alertFromSWS(this.$scope.i18n.domain_tab_DNS_update_error, err, this.$scope.alerts.main);
                    })
                    .finally(() => {
                        this.editMode = false;
                        this.loadTable();
                    });
            }

            this.dns.table.dns = _.filter(this.dns.table.dns, (currentDNS) => currentDNS.host || currentDNS.ip);
            this.editMode = false;
        }
    }
);

'use strict';

const utils = require('@iobroker/adapter-core');
const wolfsmartset = require('./lib/wss');

const MIN_POLL_INTERVAL = 60;

const timeoutHandler = [];
let device = {};
let ParamObjList = [];
//const objects = {};

class WolfSmartsetAdapter extends utils.Adapter {
    wss;
    wss_user;
    wss_password;
    onlinePoll;
    emptyCount;
    BundleValuesList;
    ValueIdList;
    /**
     * @param [options] - adapter options
     */
    constructor(options) {
        super({
            ...options,
            name: 'wolf-smartset',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    // //find Parameter for App Objects
    // async getParams(guiData) {
    //     if (guiData == null) {
    //         return;
    //     }
    //     const param = [];

    //     guiData.UserSystemOverviewData.forEach(UserSystemOverviewData => {
    //         const tabName = UserSystemOverviewData.TabName;

    //         UserSystemOverviewData.ParameterDescriptors.forEach(ParameterDescriptors => {
    //             const paramInfo = ParameterDescriptors;

    //             //search duplicate
    //             const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

    //             if (find) {
    //                 //this.log.debug('find double: ' + paramInfo.Name)
    //             } else {
    //                 paramInfo.TabName = tabName;
    //                 param.push(paramInfo);
    //             }
    //         });
    //     });
    //     return param;
    // }

    async _getParamsWebGui(guiData) {
        if (guiData == null) {
            return;
        }
        const param = [];

        guiData.MenuItems.forEach(MenuItem => {
            const tabName = MenuItem.Name;

            // Benutzerebene: iterate over MenuItems
            MenuItem.TabViews.forEach(TabView => {
                const tabName2 = `${tabName}.${TabView.TabName}`;
                // BundleId and GuiId of TabView are required in each param below thie TabView
                const TabViewBundleId = TabView.BundleId;
                const TabViewGuiId = TabView.GuiId;

                TabView.ParameterDescriptors.forEach(ParameterDescriptor => {
                    var tabName3;
                    if (typeof ParameterDescriptor.Group !== 'undefined') {
                        tabName3 = `${tabName2}.${ParameterDescriptor.Group.replace(' ', '_')}`;
                    } else {
                        tabName3 = tabName2;
                    }

                    // ignore pseudo or intermediate/complex parameters (e.g list of time programs)
                    if (ParameterDescriptor.ParameterId > 0) {
                        const paramInfo = ParameterDescriptor;
                        paramInfo.BundleId = TabViewBundleId;
                        paramInfo.GuiId = TabViewGuiId;

                        //search duplicate
                        const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

                        if (!find) {
                            paramInfo.TabName = tabName3;
                            // remove subtree if exists
                            // delete paramInfo.ChildParameterDescriptors;
                            param.push(paramInfo);
                        }
                    }

                    // Check for ChildParameterDescriptors (e.g. time program)
                    if (typeof ParameterDescriptor.ChildParameterDescriptors !== 'undefined') {
                        ParameterDescriptor.ChildParameterDescriptors.forEach(ChildParameterDescriptor => {
                            var tabName4 = `${tabName3}.${ParameterDescriptor.Name}`;

                            // ignore pseudo or intermediate/complex parameters (e.g time program)
                            if (
                                ChildParameterDescriptor.NoDataPoint == false &&
                                ChildParameterDescriptor.ParameterId > 0
                            ) {
                                const paramInfo = ChildParameterDescriptor;
                                paramInfo.BundleId = TabViewBundleId;
                                paramInfo.GuiId = TabViewGuiId;

                                //search duplicate
                                const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

                                if (!find) {
                                    paramInfo.TabName = tabName4.replace(' ', '_');
                                    param.push(paramInfo);
                                }
                            }

                            if (typeof ChildParameterDescriptor.ChildParameterDescriptors !== 'undefined') {
                                ChildParameterDescriptor.ChildParameterDescriptors.forEach(
                                    ChildChildParameterDescriptor => {
                                        const tabName5 = `${tabName4}.${ChildParameterDescriptor.Name}`;

                                        if (ChildChildParameterDescriptor.ParameterId > 0) {
                                            const paramInfo = ChildChildParameterDescriptor;
                                            paramInfo.BundleId = TabViewBundleId;
                                            paramInfo.GuiId = TabViewGuiId;

                                            //search duplicate
                                            const find = param.find(
                                                element => element.ParameterId === paramInfo.ParameterId,
                                            );

                                            if (!find) {
                                                paramInfo.TabName = tabName5.replace(' ', '_');
                                                param.push(paramInfo);
                                            }
                                        }
                                    },
                                );
                            }
                        });
                    }
                });
            });

            // Fachmannebene: interate over SubMenuEntries
            MenuItem.SubMenuEntries.forEach(SubMenuEntry => {
                const tabName2 = `${tabName}.${SubMenuEntry.Name}`;
                SubMenuEntry.TabViews.forEach(TabView => {
                    const tabName3 = `${tabName2}.${TabView.TabName}`.replace(' ', '_');
                    // BundleId and GuiId of TabView are required in each param below thie TabView
                    const TabViewBundleId = TabView.BundleId;
                    const TabViewGuiId = TabView.GuiId;

                    TabView.ParameterDescriptors.forEach(ParameterDescriptor => {
                        var tabName4;
                        if (typeof ParameterDescriptor.Group !== 'undefined') {
                            tabName4 = `${tabName3}.${ParameterDescriptor.Group.replace(' ', '_')}`;
                        } else {
                            tabName4 = tabName3;
                        }

                        // ignore pseudo or intermediate/complex parameters (e.g list of time programs)
                        if (ParameterDescriptor.ParameterId > 0) {
                            const paramInfo = ParameterDescriptor;
                            paramInfo.BundleId = TabViewBundleId;
                            paramInfo.GuiId = TabViewGuiId;

                            //search duplicate
                            const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

                            if (!find) {
                                paramInfo.TabName = tabName4;
                                param.push(paramInfo);
                            }
                        }
                    });
                });
            });
        });

        return param;
    }

    /**
     * Generates folders, channels and adapter object states for each param in WolfParamDescriptions.
     *
     * @param WolfParamDescriptions - flat list of ParamDescriptions for each state returned by getParamsWebGui()
     */
    async _CreateParams(WolfParamDescriptions) {
        // get list of instance objects before fetching new list of params from Wolf server
        const oldInstanceObjects = await this.getForeignObjectsAsync(`${this.namespace}.*`);
        const collectedChannels = {};

        // 1.: Create states
        for (const WolfParamDescription of WolfParamDescriptions) {
            // export BundleId of object to associated channel
            collectedChannels[`${WolfParamDescription.TabName}`] = WolfParamDescription.BundleId;
            const id = `${WolfParamDescription.TabName}.${WolfParamDescription.ParameterId.toString()}`;

            const common = {
                name:
                    typeof WolfParamDescription.NamePrefix !== 'undefined'
                        ? `${WolfParamDescription.NamePrefix}: ${WolfParamDescription.Name}`
                        : WolfParamDescription.Name,
                type: 'number',
                role: 'value',
                read: true,
                write: !WolfParamDescription.IsReadOnly,
            };

            // Wolf ControlTypes:
            // 0: Unknown
            // 1: Enum w/ ListItems (simple)
            // 5: Bool
            // 6: Number; 'Decimals' = decimal places (accuracy)
            // 9: Date
            // 10: Time
            // 13: list of time programs (1, 2 or 3) (not a Value)
            // 14: list of time ranges
            // 19: time program (Mon - Sun) (not a value)
            // 20: Name, SerialNo, MacAddr, SW-Version, HW-Version
            // 21: IPv4 addr or netmask
            // 31: Number of any kind
            // 35: Enum w/ ListItems (w/ Image, Decription, ...)

            if (WolfParamDescription.ControlType === 5) {
                //Boolean text
                common.type = 'boolean';
                common.role = WolfParamDescription.IsReadOnly ? 'indicator' : 'switch';
            } else if (
                WolfParamDescription.ControlType === 9 ||
                WolfParamDescription.ControlType === 10 ||
                WolfParamDescription.ControlType === 14 ||
                WolfParamDescription.ControlType === 20 ||
                WolfParamDescription.ControlType === 21
            ) {
                common.type = 'string';
                common.role = 'text';
            } else {
                if (typeof WolfParamDescription.Unit !== 'undefined') {
                    common.unit = WolfParamDescription.Unit;
                }

                // thresholds min/max : use Min/MaxValueCondition if available, otherwise use MinValue/MaxValue
                // Min/MaxValue might be wrong in case of floats, whereas Min/MaxValueCondition seem to be always correct
                if (typeof WolfParamDescription.MinValue !== 'undefined') {
                    common.min = WolfParamDescription.MinValue;
                }
                if (typeof WolfParamDescription.MinValueCondition !== 'undefined') {
                    common.min = parseFloat(WolfParamDescription.MinValueCondition);
                }
                if (typeof WolfParamDescription.MaxValue !== 'undefined') {
                    common.max = WolfParamDescription.MaxValue;
                }
                if (typeof WolfParamDescription.MaxValueCondition !== 'undefined') {
                    common.max = parseFloat(WolfParamDescription.MaxValueCondition);
                }

                if (typeof WolfParamDescription.StepWidth !== 'undefined') {
                    common.step = WolfParamDescription.StepWidth;
                }
                if (typeof WolfParamDescription.ListItems !== 'undefined') {
                    const states = {};
                    WolfParamDescription.ListItems.forEach(ListItems => {
                        states[ListItems.Value] = ListItems.DisplayText;
                    });
                    common.states = states;
                }
            }

            this.log.debug(
                `WolfParamDescription ${JSON.stringify(WolfParamDescription)} --> ioBrokerObj.common ${JSON.stringify(common)}`,
            );

            //  if this is a new object, create it first
            const fullId = `${this.namespace}.${id}`;
            if (typeof oldInstanceObjects[`${fullId}`] == 'undefined') {
                this.setObjectNotExists(id, {
                    type: 'state',
                    common: {
                        name: common.name,
                        type: common.type,
                        role: common.role,
                        read: common.read,
                        write: common.write,
                    },
                    native: {
                        ValueId: WolfParamDescription.ValueId,
                        ParameterId: WolfParamDescription.ParameterId,
                        ControlType: WolfParamDescription.ControlType,
                    },
                });
            } else {
                oldInstanceObjects[fullId].common.desc = 'active';
            }

            this.extendObject(id, {
                common: common,
                native: {
                    ValueId: WolfParamDescription.ValueId,
                    ParameterId: WolfParamDescription.ParameterId,
                    ControlType: WolfParamDescription.ControlType,
                },
            });

            // 2.: Update object states
            await this._setStatesWithDiffTypes(WolfParamDescription.ControlType, id, WolfParamDescription.Value);
        }

        // 3.: mark obsoleted objects
        for (const fullId in oldInstanceObjects) {
            let re = new RegExp(String.raw`^${this.namespace}.info`, 'g');
            if (
                !fullId.match(re) &&
                typeof oldInstanceObjects[fullId].common != 'undefined' &&
                typeof oldInstanceObjects[fullId].common.desc == 'undefined'
            ) {
                oldInstanceObjects[fullId].common.desc = 'obsoleted';
                this.extendObject(fullId, oldInstanceObjects[fullId]);
            }
        }

        // 4.: Create folders and channels
        const createdObjects = {};
        for (const [channel, bundleId] of Object.entries(collectedChannels)) {
            const name = `${channel.split('.').pop()} (Bundle: ${bundleId})`;
            this.extendObject(channel, {
                type: 'channel',
                common: {
                    name: name,
                },
                native: {},
            });
            createdObjects[channel] = true;
            this.log.debug(`Create channel ${channel}`);
            const channelParts = channel.split('.');
            let id = channelParts.shift() || '';
            let folderName = id;
            while (id && channelParts.length > 0) {
                if (!createdObjects[id]) {
                    await this.extendObject(id, {
                        type: 'folder',
                        common: {
                            name: folderName,
                        },
                        native: {},
                    });
                    this.log.debug(`Create folder ${id}`);
                    createdObjects[id] = true;
                }
                folderName = channelParts.shift() || '';
                if (!folderName) {
                    break;
                }
                id += `.${folderName}`;
            }
        }

        this.log.debug('createParams DONE');
    }

    /**
     * Creates a list of ParameterId for each BundleId defined in WolfParamDescriptions
     * The lists are required when calling PollValueList()
     *
     * @param WolfParamDescriptions - list of extended WolfParamDescriptions returned by getParamsWebGui()
     */
    async _CreateBundleValuesLists(WolfParamDescriptions) {
        const BundleValuesList = {};
        // full pull value list is stored under pseudo bundleId 0
        BundleValuesList[0] = [];

        for (const WolfParamDescription of WolfParamDescriptions) {
            const bundleId = WolfParamDescription.BundleId;
            if (typeof BundleValuesList[bundleId] == 'undefined') {
                BundleValuesList[bundleId] = [];
            }

            // De-duplicate ParamterIds for FullPull bundle: they might be at multiple locations in the tree
            if (typeof BundleValuesList[0][WolfParamDescription.ParameterId] == 'undefined') {
                BundleValuesList[0].push(WolfParamDescription.ParameterId);
            }
            // De-duplicate ParamterIds for bundleId: they might be at multiple locations in the tree
            if (typeof BundleValuesList[bundleId][WolfParamDescription.ParameterId] == 'undefined') {
                BundleValuesList[bundleId].push(WolfParamDescription.ParameterId);
            }
        }

        return BundleValuesList;
    }

    /**
     * Create the list of ValueId to request from Wolf server
     *
     */
    async _CreateValueIdList() {
        let ValueIdList = [];

        for (const bundleId of this.config.bundleIdTable) {
            if (bundleId.bundleIdUse && typeof this.BundleValuesList[bundleId.bundleIdName] != 'undefined') {
                ValueIdList = ValueIdList.concat(this.BundleValuesList[bundleId.bundleIdName]);
            }
        }

        return ValueIdList;
    }

    async _PollValueList() {
        this.onlinePoll++;

        if (timeoutHandler['pollTimeout']) {
            clearTimeout(timeoutHandler['pollTimeout']);
        }

        try {
            const recValList = await this.wss.getValList(
                device.GatewayId,
                device.SystemId,
                this.config.bundleIdRequested,
                this.ValueIdList,
            );
            if (recValList) {
                await this._SetStatesArray(recValList);
            }

            if (this.onlinePoll > 4) {
                this.onlinePoll = 0;

                const systemStatus = await this.wss.getSystemState(parseInt(device.SystemId));
                if (systemStatus && typeof systemStatus.IsOnline !== 'undefined') {
                    this.setState('info.connection', {
                        val: systemStatus.IsOnline,
                        ack: true,
                    });
                } else {
                    this.setState('info.connection', {
                        val: false,
                        ack: true,
                    });
                }
            }
        } catch (error) {
            this.log.warn(error);
        }
        timeoutHandler['pollTimeout'] = setTimeout(() => {
            this._PollValueList();
        }, this.config.pollInterval * 1000);
    }

    async _SetStatesArray(array) {
        if (array.Values.length === 0) {
            this.emptyCount++;
        } else {
            this.emptyCount = 0;
        }

        if (this.emptyCount >= 10) {
            // no data for long time try a restart
            this.emptyCount = 0;
            this.main();
            return;
        }

        array.Values.forEach(recVal => {
            //this.log.debug("search:" + JSON.stringify(recVal));

            //find ParamId for ValueId
            const findParamObj = ParamObjList.find(element => element.ValueId === recVal.ValueId);

            if (findParamObj) {
                for (const key in this.objects) {
                    if (this.objects[key].native && this.objects[key].native.ParameterId === findParamObj.ParameterId) {
                        this._setStatesWithDiffTypes(this.objects[key].native.ControlType, key, recVal.Value);
                    }
                }
            }
        });
    }

    async _setStatesWithDiffTypes(type, id, value) {
        if (type == null || id == null || value == null) {
            return;
        }

        // Wolf ControlTypes:
        // 0: Unknown
        // 1: Enum w/ ListItems (simple)
        // 5: Bool
        // 6: Number; 'Decimals' = decimal places (accuracy)
        // 9: Date
        // 10: Time
        // 13: list of time programs (1, 2 or 3) (not a Value)
        // 14: list of time ranges
        // 19: time program (Mon - Sun) (not a value)
        // 20: Name, SerialNo, MacAddr, SW-Version, HW-Version
        // 21: IPv4 addr or netmask
        // 31: Number of any kind
        // 35: Enum w/ ListItems (w/ Image, Decription, ...)
        switch (type) {
            case 5:
                this.setState(id, {
                    val: value === 'True' ? true : false,
                    ack: true,
                });
                break;
            case 9:
            case 10:
            case 14:
            case 20:
            case 21:
                this.setState(id, {
                    val: value.toString(),
                    ack: true,
                });
                break;

            default:
                this.setState(id, {
                    val: parseFloat(value),
                    ack: true,
                });
                break;
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    async onMessage(obj) {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                // e.g. send email or pushover or whatever
                this.log.info('send command');

                // Send response in callback if required
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                }
            }

            // getDeviceList: triggered by adapter instance settings UI: 'Get Devices'
            if (obj.command === 'getDeviceList') {
                this.log.info('getDeviceList');
                let devicelist;
                let getDeviceListResponse;
                try {
                    if (obj.message.username == '' || obj.message.password == '') {
                        throw new Error('Please set username and password');
                    }
                    // check if we can use an already existing instance object, otherwise create one
                    if (
                        !this.wss ||
                        this.wss_user != obj.message.username ||
                        this.wss_password != obj.message.password
                    ) {
                        this.wss = new wolfsmartset(obj.message.username, obj.message.password, this);
                        this.wss_user = obj.message.username;
                        this.wss_password = obj.message.password;
                    }

                    devicelist = await this.wss.adminGetDevicelist();
                    if (typeof devicelist !== 'undefined') {
                        getDeviceListResponse = [{ label: devicelist[0].Name, value: JSON.stringify(devicelist[0]) }];
                    } else {
                        getDeviceListResponse = [{ label: 'No devices found', value: '' }];
                    }
                } catch (error) {
                    getDeviceListResponse = [{ label: error.message, value: '' }];
                }
                this.sendTo(obj.from, obj.command, getDeviceListResponse, obj.callback);
            }

            // confirmDevice: triggered by adapter instance settings UI: 'Confirm Devices'
            if (obj.command === 'confirmDevice') {
                this.log.info('confirmDevice');
                let myDevice;
                let confirmDeviceResponse;

                try {
                    myDevice = JSON.parse(obj.message.deviceObject);

                    if (
                        typeof myDevice.Name !== 'undefined' &&
                        typeof myDevice.Id !== 'undefined' &&
                        typeof myDevice.GatewayId !== 'undefined'
                    ) {
                        confirmDeviceResponse = {
                            native: {
                                deviceName: `${myDevice.Name}`,
                                systemId: `${myDevice.Id}`,
                                gatewayId: `${myDevice.GatewayId}`,
                            },
                        };
                    } else {
                        confirmDeviceResponse = { error: 'Error: no device selected' };
                    }
                } catch (error) {
                    confirmDeviceResponse = { error: error };
                }
                this.sendTo(obj.from, obj.command, confirmDeviceResponse, obj.callback);
            }
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.onlinePoll = 4;
        this.emptyCount = 0;

        try {
            if (
                this.config.username !== '' &&
                this.config.password !== '' &&
                this.config.deviceName !== '' &&
                this.config.systemId !== '' &&
                this.config.gatewayId !== ''
            ) {
                this.config.device = {
                    Name: this.config.deviceName,
                    SystemId: this.config.systemId,
                    GatewayId: this.config.gatewayId,
                };
                device = this.config.device;

                // Adjust poll interval if required
                if (this.config.pollInterval < MIN_POLL_INTERVAL) {
                    this.config.pollInterval = MIN_POLL_INTERVAL;
                }

                // create a new instance object (do not use an existing one)
                this.wss = new wolfsmartset(this.config.username, this.config.password, this);
                this.wss_user = this.config.username;
                this.wss_password = this.config.password;

                await this.main();
            } else {
                this.log.warn('Please configure username, password and device in adapter instance settings');
            }
        } catch (error) {
            this.log.error('Please configure username, password and device in adapter instance settings');
            this.log.error(error.stack);
        }
    }

    /**
     * main function is called from onReady(), PollValueList() and in case of an error by itself
     */
    async main() {
        try {
            const wssInitialized = await this.wss.init();
            if (!wssInitialized) {
                throw new Error('Could not initialized WSS session');
            }

            const GUIDesc = await this.wss.getGUIDescription(device.GatewayId, device.SystemId);
            if (GUIDesc) {
                ParamObjList = (await this._getParamsWebGui(GUIDesc)) || [];
            } else {
                throw new Error('Could not get GUIDescription (device might be down)');
            }
            if (ParamObjList) {
                await this._CreateParams(ParamObjList);
                // create a list of params for each BundleId as defined in the GUI Desc
                this.BundleValuesList = await this._CreateBundleValuesLists(ParamObjList);
                this.ValueIdList = await this._CreateValueIdList();
            }

            this.objects = await this.getForeignObjectsAsync(`${this.namespace}.*`);
            this.log.debug(JSON.stringify(this.objects));

            await this._PollValueList();
        } catch (error) {
            this.log.warn(error);
            this.log.warn('Trying again in 60 sec...');
            timeoutHandler['restartTimeout'] && clearTimeout(timeoutHandler['restartTimeout']);
            timeoutHandler['restartTimeout'] = setTimeout(async () => {
                this.main();
            }, 60000);
        }

        this.subscribeStates('*');
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - callback function
     */
    onUnload(callback) {
        try {
            if (timeoutHandler['pollTimeout']) {
                clearTimeout(timeoutHandler['pollTimeout']);
            }
            if (timeoutHandler['restartTimeout']) {
                clearTimeout(timeoutHandler['restartTimeout']);
            }

            this.wss.stop();

            callback();
        } catch {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id - value id
     * @param state - value state
     */
    async onStateChange(id, state) {
        if (state && !state.ack) {
            //const ParamId = id.split('.').pop();
            const obj = await this.getObjectAsync(id);
            if (obj) {
                const findParamObj = ParamObjList.find(element => element.ParameterId === obj.native.ParameterId);

                this.log.info(`Change value for: ${obj.common.name}: ${JSON.stringify(state)}`);

                try {
                    const answer = await this.wss.setValList(device.GatewayId, device.SystemId, [
                        {
                            ValueId: findParamObj.ValueId,
                            ParameterId: obj.native.ParameterId,
                            Value: String(state.val),
                            ParameterName: obj.common.name,
                        },
                    ]);
                    if (typeof answer.Values !== 'undefined') {
                        this.setState(id, {
                            val: state.val,
                            ack: true,
                        });
                        await this._SetStatesArray(answer);
                    }
                } catch (err) {
                    this.log.error(err);
                }
            }
        }
    }
}

// @ts-expect-error parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = options => new WolfSmartsetAdapter(options);
} else {
    // otherwise start the instance directly
    new WolfSmartsetAdapter();
}

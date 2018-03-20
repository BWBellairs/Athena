const Dict = require('node-python-funcs').dict;
const { hasattr, callable, partition } = require('node-python-funcs');
const log = require('./utils/logging');
const Plugins = require('./utils/plugins');

function isObject(thing) {
    return thing instanceof Object && !(thing instanceof Array);
}

/** Contains vital methods used to interact with the irc server properly */
class Core {

    /** */
    constructor() {}

    /**
    * Init the class
    * @func
    * @param {object} events - Events emmiter
    * @param {object} config - Bot config
    * @param {object} state - Temporary bot db
    */
    init(events, config, state) {
        this.events = events;
        this.config = config;
        this.state = state;
        this.plugins = new Plugins(this);

        this.nickname = this.config.nickname;
        this.ISUPPORT = this.state.server.ISUPPORT = {};
        this.chanels = this.state.channels;

        this.on_ping = this.events.on('PING', irc => {
            // Respond to ping event
            this.send('PONG');
        });

        this.on_nick_in_use = this.events.on('433', (irc, event) => {
            this.nickname = this.nickname.concat('_');
            irc.nick(this.nickname);
        });

        this.on_welcome = this.events.on('001', (irc, event) => {
            Object.keys(this.config.channels).forEach(channel => {
                irc.join(channel, this.config.channels[channel].key);
            });
        });

        this.on_join = this.events.on('JOIN', (irc, event) => {
            let channel = event.target;
            let args = event.arguments;

            if (event.source.nick === this.config.nickname) {
                log.info('Joining %s', channel);
                if (!this.state.channels.hasOwnProperty(channel)) {
                    this.state.channels[channel] = new Dict({
                        users: {},
                        names: [],
                        flags: [],
                        modes: [],
                        key: null
                    });
                }

                irc.send(`WHO ${event.target} nuhs%nhuac`);
                irc.send(`NAMES ${event.target}`);
                irc.mode(event.target, '', ''); // Get modes for the DB
            } else {
                // Extended join methods
                if (args.length > 0) {
                    let nick = event.source.nick;
                    let hostmask = event.source;
                    let account = args[0] !== '*' ? args[0] : null;

                    this.state.channels.add_entry(channel, nick, hostmask, account);
                }

                irc.send(`WHO ${event.source.nick} nuhs%nhuac`);
            }
        });

        this.on_name = this.events.on('353', (irc, event) => {
            const channel = event.arguments[1];
            const users = event.arguments[2].split(' ');

            for (let i of users) {
                if (i.startsWith('@+')) {
                    this.state.channels[channel].names.push(i.slice(2));
                } else if (i.startsWith('@') || i.startsWith('+')) {
                    this.state.channels[channel].names.push(i.slice(1));
                } else {
                    this.state.channels[channel].names.push(i);
                }
            }
        });

        this.on_whox = this.events.on('354', (irc, event) => {
            let nick = event.arguments[3];

            if (nick !== 'ChanServ') {
                let args = event.arguments;
                let [ident, host] = args.slice(1, 3);
                let hostmask = `${nick}!${ident}@${host}`;
                let channel = args[0];
                let account = args[4] !== '0' ? args[4] : null;

                this.state.channels.add_entry(channel, nick, hostmask, account);
            }
        });

        this.on_channelmodeis = this.events.on('324', (irc, event) => {
            this.state.channels[event.arguments[0]].modes.push(...event.arguments[1].slice(1).split(''));
        });

        this.on_cap = this.events.on('CAP', (irc, event) => this.caps.handler(event));

        this.on_authenticate = this.events.on('AUTHENTICATE', (irc, event) => this.sasl.on_authenticate(event));

        this.on_saslfailed = this.events.on('904', (irc, event) => this.sasl.on_saslfailed(event));

        this.on_saslsuccess = this.events.on('903', (irc, event) => this.sasl.on_saslsuccess(event));

        this.on_alreadyregistered = this.events.on('462', (irc, event) => { /* eslint-disable max-len */
            log.error('Either you aren\'t registered and are trying to use SASL or you\'re trying to re-do the USER command');
        });

        this.on_nick = this.events.on('NICK', (irc, event) => {
            if (event.source.nick === this.config.nickname) {
                this.config.nickname = event.arguments[0];
            }
        });

        this.on_privmsg = this.events.on('PRIVMSG', (irc, event) => {
            let args = event.arguments.join(' ').split(' '); // Split arguments by spaces

            if (args[0].startsWith('*')) {
                args[0] = args[0].slice(1);
                this.plugins.call_command(event, irc, args);
            }
        });

        this.on_ctcp = this.events.on('CTCP', (irc, event) => {
            if (hasattr(this, 'ctcp')) {
                let ctcp_message = ' '.join(event.arguments).toUpperCase();

                if (Object.keys(this.ctcp).includes(ctcp_message)) {
                    let result;

                    if (callable(this.ctcp[ctcp_message])) {
                        result = this.ctcp[ctcp_message]();
                    } else {
                        result = this.ctcp[ctcp_message];
                    }

                    irc.notice(event.source.nick, `${ctcp_message} ${result}`);
                }
            }
        });

        this.on_featurelist = this.events.on('005', (irc, event) => {
            for (let param of event.arguments.slice(-1)) {
                let split = partition(param, '=');
                let name = split[0];
                let value = split[2];

                if (!Object.keys(this.ISUPPORT).includes(name)) {
                    this.ISUPPORT[name] = {};
                }
                if (value !== '') {
                    if (value.indexOf(',') > -1) {
                        for (let param1 of value.split(',')) {
                            if (value.indexOf(')') > -1) {
                                let name1, value1;

                                if (param1.indexOf(')') > -1) {
                                    split = partition(param1, ':');

                                    name1 = split[0];
                                    value1 = split[2];
                                }
                                this.ISUPPORT[name][name1] = value1;
                            } else {
                                if (Object.keys(this.ISUPPORT).includes(name) && isObject(this.ISUPPORT[name])) {
                                    this.ISUPPORT[name] = [];
                                }
                                this.ISUPPORT[name].push(param1);
                            }
                        }
                    } else {
                        if (value.indexOf(')') > -1) {
                            let [name1, value1] = value.split(':');

                            this.ISUPPORT[name][name1] = value1;
                        } else if (name === 'PREFIX') {
                            let count = 0;

                            value = value.split(')');
                            value[0] = value[0].lstrip('(');
                            let types = value[0].split(new RegExp('^(.*o)(.*h)?(.*)$')).slice(1, -1);
                            let levels = {
                                op: types[0],
                                halfop: types[1] || '',
                                voice: types[2]
                            };

                            this.server.prefixes = {};

                            for (let mode of value[0]) {
                                let name1 = mode;
                                let value1 = value[1][count];

                                count += 1;
                                for (let level of levels.items()) {
                                    if (level[1].indexOf(mode) > -1) {
                                        this.server.prefixes[value1] = {
                                            mode: mode,
                                            level: level[0]
                                        };
                                        break;
                                    }
                                }
                                this.ISUPPORT[name][name1] = value1;
                            }
                        } else {
                            this.ISUPPORT[name] = value;
                        }
                    }
                } else {
                    this.ISUPPORT[name] = value;
                }
            }
        });
    }

    /**
    * Function to send messages and log them aferwards
    * @func
    * @param {string} message - The message you want to send
    */
    send(message) {
        this.socket.write(`${message}\r\n`);
        log.debug('[SENT] %s', message);
    }

}

module.exports = Core;

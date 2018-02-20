/** Class that gets different values from a users hostmask */
class User {

    /**
    * @param {string} userhost - The userhost of the user
    */
    constructor(userhost) {
        this.userhost = userhost;
        [this.nick, this.ident] = this.userhost.split('!');
        this.nick = this.nick !== undefined ? this.nick : null;
        this.host = this.userhost.split('@')[1];
        this.host = this.host !== undefined ? this.host : null;
        this.ident = this.ident !== undefined ? this.ident.split('@')[0] : null;
    }

}

/**
 * Function to imitate Python's str.split method, since JavaScript can't split x times
 * @func
 * @param {string} string - The string you want split.
 * @param {string} sep - The seperator by which you want the string to be split
 * @param {number} maxCount - The maximum count of times you wish to split
 */

function split(string, sep, maxCount) {
    string = string.split(sep);
    const first = string.slice(0, maxCount);
    const second = string.slice(maxCount).join(sep);

    return [...first, second];
}

/** Class that parses messages and returns different information about it */
class Parser {

    /**
    * @func
    * @param {string} raw - The raw message from the socket
    */
    constructor(raw) {
        // Initialise these variables here so they have a fallback value if they don't get redfined elsewhere
        this.source = null;
        this.target = null;
        this.tags = [];
        this.raw = raw.toString(); // Raw string sent from server | This is a const, it should never be changed
        this.user = {};

        this.arguments = [];
        this.args = this.arguments; // Alias to this.arguments

        let argument = '';
        let argument2 = ''; // In commands such as MODE and PRIVMSG argument are after :
        /* [RECV] :BWBellairs!~bwbellair@botters/BWBellairs PRIVMSG ##Athena :Argument-1 Argument-2 Argument-3 etc
                                                    Command ^   Channel ^      ^ argument!!!
        */
        let raw_msg = this.raw; // Variable for raw message parsing in code

        // IRCv3.2 Message Tags
        if (raw_msg.startsWith('@')) {
            let tags;

            [tags, raw_msg] = split(this.raw, ' ', 1); // Split raw into tags and other raw...
            tags = tags.replace('@', '', 1); // Let's find the tags!
            tags = tags.split(';'); // Here are the tags!

            for (let tag of tags) {
                if ('=' in tag) {
                    tag = split(tag, '=', 1);
                    const tag_parsed = {};

                    tag_parsed[tag[0]] = tag[1]; // Set tag to it's value
                    this.tags.push(tag_parsed);
                } else {
                    this.tags.push(tag);
                }
            }
        }

        if (raw_msg.indexOf(' :') > -1) { // Check to see if there are arguments
            [raw_msg, argument] = split(raw_msg, ' :', 1);

            /* [RECV] :BWBellairs!~bwbellair@botters/BWBellairs PRIVMSG ##Athena :Argument-1 Argument-2 Argument-3 etc
                      ^-------------------------------------------------------^  ^-----------------------------------^
                        This.raw ^                                                            argument ^
            */
        }

        if (raw_msg.startsWith(':')) {
            raw_msg = raw_msg.slice(1).split(' '); // If the message starts With : then remove it then split it into a list | +1
            this.source = new User(raw_msg[0]);
            this.command = raw_msg[1];

            if (raw_msg.length > 2 && this.command !== 'ACCOUNT') {
                this.target = raw_msg[2];
            }

            if (raw_msg.length > 3) {
                argument2 = raw_msg.slice(3).join(' ');
            }

            if (this.command === 'ACCOUNT') {
                argument2 = raw_msg[2];
            }
        } else {
            raw_msg = raw_msg.split(' ');
            this.command = raw_msg[0];
            this.arguments.push(raw_msg[1]);
        }

        if (argument.length) {
            if (argument2.length) {
                argument2 = `${argument2} :${argument}`;
            } else {
                argument2 = `:${argument}`;
            }
        }

        argument2 = argument2.startsWith(':') ? split(argument2, ':', 1) : split(argument2, ' :', 1);

        for (const arg of argument2[0].split(' ')) {
            if (arg.length >= 1) {
                this.arguments.push(arg);
            }
        }

        if (argument2.length > 1) {
            this.arguments.push(argument2[1]);
        }
    }
}


module.exports = Parser;

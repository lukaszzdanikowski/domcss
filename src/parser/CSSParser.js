(function(root, factory) {
    "use strict";
    if (typeof define === "function" && define.amd) {
        define(factory);
    } else {
        root.CSSParser = factory();
    }
}(this, function() {
    var defaultOptions = {
        source: null
    };

    var CSSParser = {
        parse: function parse(cssText, _options) {
            var options = {};

            Object.keys(_options).concat(Object.keys.defaultOptions)
                .filter(function(key, idx, arr) {
                    return idx === arr.indexOf(key);
                })
                .forEach(function(key) {
                    options[key] = typeof _options[key] != "undefined" ? _options[key] : defaultOptions[key];
                });

            var context = {
                css: cssText,
                lineNumber: 1,
                columnNumber: 1,
                options: options,
                cssText: cssText,
                errorList: []
            };

            var stylesheetObj = stylesheet(context);

            return addParent(stylesheetObj, null, stylesheetObj);
        }
    };

    // http://www.w3.org/TR/CSS21/grammar.html
    // https://github.com/visionmedia/css-parse/pull/49#issuecomment-30088027
    var commentre = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g;

    var newlinere = /\n/g;
    var whitespacere = /^\s*/;
    var selectorre = /^([^{]+)/;
    var propertyre = /^(\*?[-#\/\*\\\w]+(\[[0-9a-z_-]+\])?)\s*/;
    var valuere = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)/;
    var colonre = /^:\s*/;
    var semicolonre = /^[;\s]*/;
    var atkeyframere = /^@([-\w]+)?keyframes\s*/;
    var atsupportre = /^@supports *([^{]+)/;
    var athostre = /^@host\s*/;
    var atmediare = /^@media *([^{]+)/;
    var atcustommediare = /^@custom-media\s+(--[^\s]+)\s*([^{;]+);/;
    var atpagere = /^@page */;
    var atdocumentre = /^@([-\w]+)?document *([^{]+)/;
    var atfontfacere = /^@font-face\s*/;
    var atimportre = /^@import\s*(?:((?:\"([^"]+)\")|(?:url\((?:\"([^"]+)\")\))|(?:\'([^']+)\')|(?:url\((?:\'([^']+)\')\))|(?:url\((?:([^\)]+))\)))([^;]*));/;
    var atcharsetre = /^@charset\s*([^;]+);/;
    var atnamespacere = /^@namespace\s+(?:(\w+)\s+)?(?:(?:url\(\'([^\']+)\'\))|(?:url\(\"([^\"]+)\"\))|(?:\"([^\"]+)\")|(?:\'([^\']+)\')|(?:url\(([^\)]+)\)));/;

    /**
     * Store position information
     */
    function Position(start, ctx) {
        this.start = start;
        this.end = {
            line: ctx.lineNumber,
            column: ctx.columnNumber
        };
        this.source = ctx.options.source;
        this.content = ctx.cssText;
    }

    /**
     * Update lineNumber and columnNumber based on `str`.
     */
    function updatePosition(str, ctx) {
        var lines = str.match(newlinere);
        ctx.lineNumber += lines ? lines.length : 0;
        var i = str.lastIndexOf("\n");
        ctx.columnNumber = str.length + (~i ? (-1 * i) : ctx.columnNumber);
    }

    function setNodePosition(start, node, ctx) {
        node.position = new Position(start, ctx);
        whitespace(ctx);
        return node;
    }

    /**
     * Mark position and patch `node.position`.
     */
    function position(ctx) {
        var start = {
            line: ctx.lineNumber,
            column: ctx.columnNumber
        };
        return setNodePosition.bind(null, start /* node, ctx */);
    }

    /**
     * Error `msg`.
     */
    function error(msg, ctx) {
        var err = new Error(ctx.options.source + ":" + ctx.lineNumber + ":" + ctx.columnNumber + ": " + msg);
        err.reason = msg;
        err.filename = ctx.options.source;
        err.line = ctx.lineNumber;
        err.column = ctx.columnNumber;
        err.source = ctx.cssText;

        if (ctx.options.silent) {
            ctx.errorsList.push(err);
        } else {
            throw err;
        }
    }

    function MediaList() {}
    function createMediaList(media) {
        var mediaList = new MediaList();
        var mediaArray = trim(media).split(",").map(function(el) {
            return trim(el).split(":").map(function(el) {
                return trim(el);
            }).join(": ");
        });
        Object.defineProperties(mediaList, {
            "mediaText": {
                enumerable: true,
                value: mediaArray.join(", ")
            },
            "length": {
                enumerable: true,
                value: mediaArray.length
            },
            "item": {
                enumerable: false,
                value: function() {
                    var _undefined;
                    if (arguments[0] >= 0 && arguments[0] < this.length) {
                        return this[arguments[0]];
                    } else {
                        return _undefined;
                    }
                }
            }
        });
        mediaArray.forEach(function(el, idx, arr) {
            Object.defineProperty(mediaList, idx, {
                enumerable: false,
                value: el
            });
        });

        return mediaList;
    }

    function CSSStyleSheet() {}
    function createCSSStyleSheet(options) {
        var disabled = false;
        var cssStylesheet = new CSSStyleSheet();

        Object.defineProperties(cssStylesheet, {
            "type": {
                value: "text/css",
                enumerable: true
            },
            "disabled": {
                enumerable: true,
                get: function() {
                    return disabled;
                },
                set: function(value) {
                    disabled = !!value;
                }
            },
            "ownerNode": {
                enumerable: true,
                value: options.ownerNode
            },
            "ownerRule": {
                enumerable: true,
                value: null
            },
            "parentStyleSheet": {
                enumerable: true,
                value: null
            },
            "href": {
                enumerable: true,
                value: null
            },
            "title": {
                enumerable: true,
                value: null
            },
            "media": {
                enumerable: true,
                value: options.mediaList
            },
            "cssRules": {
                enumerable: true,
                value: options.rulesList,
            }
        });

        return cssStylesheet;
    }
    function CSSRuleList() {}
    function createCSSRuleList(options) {
        var ruleList = new CSSRuleList();
        Object.defineProperties(ruleList, {
            "length": {
                enumerable: true,
                value: options.ruleArray.length
            },
            "item": {
                enumerable: false,
                value: function() {
                    var _undefined;
                    if (arguments[0] >= 0 && arguments[0] < this.length) {
                        return this[arguments[0]];
                    } else {
                        return _undefined;
                    }
                }
            }
        });
        options.ruleArray.forEach(function(el, idx, arr) {
            Object.defineProperty(ruleList, idx, {
                enumerable: false,
                value: el
            });
        });
        return ruleList;
    }

    function insertCSSRuleProperties(cssRule, options) {
        Object.defineProperties(cssRule, {
            "cssText": {
                enumerable: true,
                value: options.cssText
            },
            "type": {
                enumerable: true,
                value: options.type
            },
        });
        return cssRule;
    }
    function CSSStyleRule() {}
    function createCSSStyleRule(options) {
        var styleRule = new CSSStyleRule();
        options.cssText = options.selectorText + " { " + options.style.cssText + " }";
        options.type = 1; // STYLE_RULE
        insertCSSRuleProperties(styleRule, options);
        Object.defineProperties(styleRule, {
            "selectorText": {
                enumerable: true,
                value: options.selectorText
            },
            "style": {
                enumerable: true,
                value: options.style
            }
        });

        return styleRule;
    }

    function insertCSSGroupingRuleProperties(rule, options) {
        insertCSSRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "cssRules": {
                enumerable: true,
                value: options.cssRules
            }
        });
        return rule;
    }
    function insertCSSConditionRuleProperties(rule, options) {
        insertCSSGroupingRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "conditionText": {
                enumerable: true,
                value: options.conditionText
            }
        });
        return rule;
    }
    function CSSMediaRule() {}
    function createCSSMediaRule(options) {
        var mediaRule = new CSSMediaRule();
        options.cssText = "@media " + options.media.mediaText + " { " + " }"; // TODO fill child rules
        options.type = 4; // MEDIA_RULE
        options.conditionText = options.mediaText;
        insertCSSRuleProperties(mediaRule, options);
        insertCSSConditionRuleProperties(mediaRule, options);
        Object.defineProperties(mediaRule, {
            "media": {
                enumerable: true,
                value: options.media
            }
        });
        return mediaRule;
    }

    /*
     * https://drafts.csswg.org/mediaqueries/#custom-mq
     */

    function CSSCustomMediaRule() {}
    function createCSSCustomMediaRule(options) {
        var rule = new CSSCustomMediaRule();
        options.cssText = "@custom-media --" + options.name + " " + options.media.mediaText;
        options.type = 17; // CUSTOM_MEDIA_RULE
        insertCSSRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "name": {
                enumerable: true,
                value: options.name
            },
            "media": {
                enumerable: true,
                value: options.media
            }
        });
        return rule;
    }

    function CSSFontFaceRule() {}
    function createCSSFontFaceRule(options) {
        var fontFaceRule = new CSSFontFaceRule();
        options.cssText = "@font-face { " + options.style.cssText + " }";
        options.type = 5; // FONT_FACE_RULE
        insertCSSRuleProperties(fontFaceRule, options);
        Object.defineProperties(fontFaceRule, {
            "style": {
                enumerable: true,
                value: options.style
            }
        });

        return fontFaceRule;
    }

    /*
     * https://drafts.csswg.org/css-animations/#csskeyframesrule
     */
    function CSSKeyframesRule() {}
    function createCSSKeyframesRule(options) {
        var rule = new CSSKeyframesRule();
        options.cssText = "@keyframes " + options.name + " { " + " }"; // TODO
        options.type = 7; // KEYFRAMES_RULE
        insertCSSGroupingRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "name": {
                enumerable: true,
                value: options.name
            }
        });
        return rule;
    }

    function CSSKeyframeRule() {}
    function createCSSKeyframeRule(options) {
        var rule = new CSSKeyframeRule();
        options.cssText = options.keyText + " { " + options.style.cssText + " }";
        options.type = 8; // KEYFRAME_RULE
        insertCSSRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "keyText": {
                enumerable: true,
                value: options.keyText
            },
            "style": {
                enumerable: true,
                value: options.style
            }
        });
        return rule;
    }

    /*
     * https://drafts.csswg.org/css-conditional-3/#the-csssupportsrule-interface
     */
    function CSSSupportsRule() {}
    function createCSSSupportsRule(options) {
        var rule = new CSSSupportsRule();
        options.cssText = "@supports " + options.conditionText + " { " + " }"; // TODO fill child rules
        options.type = 12; // SUPPORTS_RULE
        insertCSSConditionRuleProperties(rule, options);
        return rule;
    }

    function CSSImportRule() {}
    function createCSSImportRule(options) {
        var rule = new CSSImportRule();
        options.type = 3; // IMPORT_RULE
        insertCSSRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "href": {
                enumerable: true,
                value: options.href
            },
            "media": {
                enumerable: true,
                value: options.media
            },
            "styleSheet": { // TODO
                enumerable: true,
                value: null
            }
        });
        return rule;
    }

    /*
     * https://drafts.csswg.org/cssom/#the-cssnamespacerule-interface
     */

    function CSSNamespaceRule() {}
    function createCSSNamespaceRule(options) {
        var rule = new CSSNamespaceRule();
        options.type = 10; // NAMESPACE_RULE
        insertCSSRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "namespaceURI": {
                enumerable: true,
                value: options.namespaceURI
            },
            "prefix": {
                enumerable: true,
                value: options.prefix
            }
        });
        return rule;
    }

    function CSSPageRule() {}
    function createCSSPageRule(options) {
        var rule = new CSSPageRule();
        options.cssText = "@page " + options.selectorText + " { " + options.style.cssText + " }"; // TODO
        options.type = 6; // PAGE_RULE
        insertCSSRuleProperties(rule, options);
        Object.defineProperties(rule, {
            "selectorText": {
                enumerable: true,
                value: options.selectorText
            },
            "style": {
                enumerable: true,
                value: options.style
            }
        });
        return rule;
    }

    function CSSDocumentRule() {}
    function createCSSDocumentRule(options) {
        var rule = new CSSDocumentRule();
        options.cssText = "@document " + options.conditionText + " { " + " }"; // TODO fill child rules
        options.type = 13; // DOCUMENT_RULE
        insertCSSConditionRuleProperties(rule, options);
        return rule;
    }

    function CSSHostRule() {}
    function createCSSHostRule(options) {
        var rule = new CSSHostRule();
        options.cssText = "@host { " + " }"; // TODO fill child rules
        options.type = 1001; // HOST_RULE
        insertCSSGroupingRuleProperties(rule, options);
        return rule;
    }

    function CSSStyleDeclaration() {}
    function createCSSStyleDeclaration(options) {
        var styleDeclaration = new CSSStyleDeclaration();
        var cssText = options.declarationsArray.map(function(el) {
            return el.property + ": " + el.value;
        }).join("; ");
        Object.defineProperties(styleDeclaration, {
            "cssText": {
                enumerable: true,
                value: cssText
            },
            "length": {
                enumerable: true,
                value: options.declarationsArray.length
            },
            "item": {
                enumerable: false,
                value: function() {
                    var _undefined;
                    if (arguments[0] >= 0 && arguments[0] < this.length) {
                        return this[arguments[0]];
                    } else {
                        return _undefined;
                    }
                }
            }
        });

        options.declarationsArray.forEach(function(el, idx, arr) {
            Object.defineProperty(styleDeclaration, idx, {
                enumerable: false,
                value: el.property
            });
            Object.defineProperty(styleDeclaration, el.property, {
                enumerable: true,
                value: el.value
            });
        });
        return styleDeclaration;
    }

    function DOMException() {}

    /**
     * Parse stylesheet.
     */
    function stylesheet(ctx) {
        return createCSSStyleSheet({
            rulesList: rules("", ctx),
            mediaList: createMediaList(""),
            ownerNode: ctx.options.ownerNode || null
        });
    }

    /**
     * Opening brace.
     */
    function open(ctx) {
        return match(/^{\s*/, ctx);
    }

    /**
     * Closing brace.
     */
    function close(ctx) {
        return match(/^}/, ctx);
    }

    /**
     * Parse rulese.
     */
    function rules(_scope, ctx) {
        var scope = _scope || "";
        var node;
        var ruleArray = [];

        if (scope !== "") {
            if (!open(ctx)) {
                return error(scope + "missing '{'", ctx);
            }
        }
        whitespace(ctx);
        comments(null, ctx);
        whitespace(ctx);
        while (ctx.css.length && ctx.css.charAt(0) != "}" && (node = atrule(ctx) || rule(ctx))) {
            if (node !== false &&
                node.type !== "charset") {
                ruleArray.push(node);
            }
            whitespace(ctx);
            comments(null, ctx);
            whitespace(ctx);
        }

        if (scope !== "") {
            if (!close(ctx)) {
                return error(scope + "missing '}'", ctx);
            }
        }

        return createCSSRuleList({ruleArray: ruleArray});
    }

    /**
     * Match `regex` and return captures.
     */
    function match(regex, ctx) {
        var matchList = regex.exec(ctx.css);
        if (matchList) {
            var str = matchList[0];
            updatePosition(str, ctx);
            ctx.css = ctx.css.slice(str.length);
            return matchList;
        }
    }

    /**
     * Parse whitespace.
     */
    function whitespace(ctx) {
        match(whitespacere, ctx);
    }

    /**
     * Parse comments;
     */
    function comments(rules, ctx) {
        var c;
        rules = rules || [];
        while (!!(c = comment(ctx))) {
            if (c !== false) {
                rules.push(c);
            }
        }
        return rules;
    }

    /**
     * Parse comment.
     */
    function comment(ctx) {
        var pos = position(ctx);
        if ("/" != ctx.css.charAt(0) || "*" != ctx.css.charAt(1)) {
            return;
        }
        var i = 2;
        while ("" !== ctx.css.charAt(i) && ("*" != ctx.css.charAt(i) || "/" != ctx.css.charAt(i + 1))) {
            i = i + 1;
        }
        i += 2;

        if ("" === ctx.css.charAt(i - 1)) {
            return error("End of comment missing", ctx);
        }

        var str = ctx.css.slice(2, i - 2);
        ctx.columnNumber += 2;
        updatePosition(str, ctx);
        ctx.css = ctx.css.slice(i);
        ctx.columnNumber += 2;

        return pos({
            type: "comment",
            comment: str
        }, ctx);
    }

    /**
     * Parse selector.
     */
    function selector(ctx) {
        var matchList = match(selectorre, ctx);
        if (!matchList) {
            return;
        }
        /* @fix Remove all comments from selectors
         *     http://ostermiller.org/findcomment.html */
        return trim(matchList[0])
            .replace(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g, "")
            .replace(/"(?:\\"|[^"])*"|'(?:\\'|[^'])*'/g, function(m) {
                return m.replace(/,/g, "\u200C");
            })
            .split(/\s*(?![^(]*\)),\s*/)
            .map(function(s) {
                return s.replace(/\u200C/g, ",");
            });
    }

    /**
     * Parse declaration.
     */
    function declaration(ctx) {
        var pos = position(ctx);

        // prop
        var prop = match(propertyre, ctx);
        if (!prop) {
            return;
        }
        prop = trim(prop[0]);

        // :
        if (!match(colonre, ctx)) {
            return error("property missing ':'", ctx);
        }

        // val
        var val = match(valuere, ctx);

        var ret = pos({
            type: "declaration",
            property: prop.replace(commentre, ""),
            value: val ? trim(val[0]).replace(commentre, "") : ""
        }, ctx);

        // ;
        match(semicolonre, ctx);

        return ret;
    }

    /**
     * Parse declarations.
     */
    function declarations(_scope, ctx) {
        var scope = _scope || "";

        whitespace(ctx);
        if (!open(ctx)) {
            return error(scope + "missing '{'", ctx);
        }
        comments(null, ctx);

        // declarations
        var decl;
        var decls = [];
        while (!!(decl = declaration(ctx))) {
            if (decl !== false) {
                decls.push(decl);
            }
            whitespace(ctx);
            comments(null, ctx);
            whitespace(ctx);
        }

        if (!close(ctx)) {
            return error(scope + "missing '}'", ctx);
        }
        return createCSSStyleDeclaration({
            declarationsArray: decls
        });
    }

    /**
     * Parse keyframe.
     */
    function keyframe(ctx) {
        var m;
        var val;
        var vals = [];

        while (!!(m = match(/^((\d+\.\d+|\.\d+|\d+)%?|from|to)\s*/, ctx))) {
            val = m[1] === "from" ? "0%" : m[1] === "to" ? "100%" : m[1];
            vals.push(val);
            match(/^,\s*/, ctx);
        }

        if (!vals.length) { return; }

        return createCSSKeyframeRule({
            keyText: vals.join(", "),
            style: declarations("keyframe ", ctx)
        });
    }

    /**
     * Parse keyframes.
     */
    function atkeyframes(ctx) {
        var m = match(atkeyframere, ctx);

        if (!m) { return; }
        var vendor = m[1];

        // identifier
        m = match(/^([-\w]+)\s*/, ctx);
        if (!m) { return error("@keyframes missing name", ctx); }

        var name = m[1];

        if (!open(ctx)) { return error("@keyframes missing '{'", ctx); }

        comments(null, ctx);
        var frame;
        var frames = [];
        while (!!(frame = keyframe(ctx))) {
            frames.push(frame);
            whitespace(ctx);
            comments(null, ctx);
            whitespace(ctx);
        }

        if (!close(ctx)) { return error("@keyframes missing '}'", ctx); }

        return createCSSKeyframesRule({
            name: name,
            vendor: vendor,
            cssRules: createCSSRuleList({ruleArray: frames})
        });
    }

    /**
     * Parse supports.
     */
    function atsupports(ctx) {
        var m = match(atsupportre, ctx);

        if (!m) { return; }

        return createCSSSupportsRule({
            conditionText: trim(m[1]),
            cssRules: rules("@supports ", ctx)
        });
    }

    /**
     * Parse host.
     */
    function athost(ctx) {
        var m = match(athostre, ctx);

        if (!m) { return; }

        return createCSSHostRule({
            cssRules: rules("@host", ctx)
        });
    }

    /**
     * Parse media.
     */
    function atmedia(ctx) {
        var m = match(atmediare, ctx);

        if (!m) { return; }

        return createCSSMediaRule({
            media: createMediaList(m[1]),
            cssRules: rules("@media ", ctx)
        });
    }

    /**
     * Parse custom-media.
     */
    function atcustommedia(ctx) {
        var m = match(atcustommediare, ctx);

        if (!m) { return; }

        return createCSSCustomMediaRule({
            name: trim(m[1]),
            media: createMediaList(m[2])
        });
    }

    /**
     * Parse paged media.
     */
    function atpage(ctx) {
        var m = match(atpagere, ctx);

        if (!m) { return; }

        return createCSSPageRule({
            selectorText: (selector(ctx) || []).join(", "),
            style: declarations("@page ", ctx)
        });
    }

    /**
     * Parse document.
     */
    function atdocument(ctx) {
        var m = match(atdocumentre, ctx);

        if (!m) { return; }

        return createCSSDocumentRule({
            conditionText: trim(m[2]),
            vendor: trim(m[1]),
            cssRules: rules("@document ", ctx)
        });
    }

    /**
     * Parse font-face.
     */
    function atfontface(ctx) {
        var m = match(atfontfacere, ctx);

        if (!m) { return; }

        return createCSSFontFaceRule({
            style: declarations("@font-face ", ctx)
        });
    }

    /**
     * Parse charset
     */
    function atcharset(ctx) {
        var pos = position(ctx);
        var m = match(atcharsetre, ctx);

        if (!m) { return; }

        var charset = trim(m[1].replace(/\'\"/g, ""));
        ctx.encoding = charset;

        return pos({
            type: "charset",
            "charset": charset
        }, ctx);
    }

    /**
     * Parse import
     */
    function atimport(ctx) {
        var m = match(atimportre, ctx);

        if (!m) { return; }

        return createCSSImportRule({
            cssText: m[0],
            href: trim(m[2] || m[3] || m[4]),
            media: createMediaList(m[7])
        });
    }
    /**
     * Parse namespace
     */
    function atnamespace(ctx) {
        var m = match(atnamespacere, ctx);

        if (!m) { return; }

        return createCSSNamespaceRule({
            cssText: m[0],
            namespaceURI: trim(m[2] || m[3] || m[4] || m[5] || m[6]),
            prefix: trim(m[1])
        });
    }

    /**
     * Parse at rule.
     */
    function atrule(ctx) {
        if (ctx.css.charAt(0) != "@") {
            return;
        }

        return atkeyframes(ctx) ||
            atmedia(ctx) ||
            atcustommedia(ctx) ||
            atsupports(ctx) ||
            atimport(ctx) ||
            atcharset(ctx) ||
            atnamespace(ctx) ||
            atdocument(ctx) ||
            atpage(ctx) ||
            athost(ctx) ||
            atfontface(ctx);
    }

    /**
     * Parse rule.
     */
    function rule(ctx) {
        var sel = selector(ctx);

        if (!sel) { return error("selector missing", ctx); }

        comments(null, ctx);

        return createCSSStyleRule({
            selectorText: sel.join(", "),
            style: declarations("", ctx)
        });
    }

    /**
     * Trim `str`.
     */

    function trim(str) {
        return str ? str.replace(/^\s+|\s+$/g, "") : "";
    }

    /**
     * Adds parentRule and parentStyleSheet node reference to each nodes.
     */
    function addParent(stylesheet, rule, obj) {
        var isNode = obj && typeof obj.type === "number";

        if (obj.cssRules) {
            for (var i = 0; i < obj.cssRules.length; ++i) {
                addParent(stylesheet, isNode ? obj : rule, obj.cssRules.item(i));
            }
        }

        if (isNode) {
            Object.defineProperty(obj, "parentRule", {
                enumerable: true,
                value: rule || null
            });
            Object.defineProperty(obj, "parentStyleSheet", {
                enumerable: true,
                value: stylesheet || null
            });
        }

        return obj;
    }

    return CSSParser;
}));

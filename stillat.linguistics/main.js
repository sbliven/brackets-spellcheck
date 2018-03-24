/*
 * Copyright (c) 2016-2018 - Johnathon Koster. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

/**
 * This file is the main entry point for the Linguistics extension.
 */
define(function (require, exports, module) {
    "use strict";

    var AppInit = brackets.getModule("utils/AppInit"),
        MainViewManager = brackets.getModule("view/MainViewManager"),
        LanguageManager = brackets.getModule("language/LanguageManager"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        Commands = brackets.getModule("command/Commands"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Preferences = require("src/preferences/PreferencesManager"),
        Package = brackets.getModule("extensibility/Package"),
        EditorManager = require("src/editor/EditorManager"),
        StyleManager = require("src/ui/StyleManager"),
        LocaleStatusBar = require("src/ui/LocaleStatusBar"),
        Paths = require("src/utils/Paths");

    var LIVE_DICTIONARIES_PATH = "https://s3.amazonaws.com/stillat/alice/stillat.linguistics-dictionary.zip";

    /**
     * Helper function to call all the various methods required for
     * Linguistics to work correctly.
     */
    function _updateEnvironment() {
        Preferences.updatePreferences();
        StyleManager.updateVisualizations(Preferences.spellingVisualizationColor, Preferences.grammarVisualizationColor);
        EditorManager.setSpellCheckEnabled(Preferences.spellCheckEnabled);
        EditorManager.updateInterface();
    }

    // Get everything rolling.
    AppInit.appReady(function () {
        // Check whether or not the dictionaries are available for use. If we cannot
        // find the dictionary paths, we will prompt the user and install them
        // automatically if they give us permission to do so.
        appshell.fs.stat(Paths.getDictionaryPath(), function (err, modtime, isdir, size, realPath) {
            if (typeof err !== 'undefined' && err !== null) {
                if (err == appshell.fs.ERR_NOT_FOUND) {
                    var checkFeaturesDialog = Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_INFO,
                        "Alice",
                        "Hello, there! It seems you are missing the dictionaries required for Alice to work. Would you like to download them now? We will restart Brackets after this to complete the installation.",
                        [
                            {
                                className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                                id: "cancel",
                                text: "Not right now"
                            },
                            {
                                className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                                id: "download",
                                text: "Download Dictionaries"
                            }
                        ]
                    );

                    checkFeaturesDialog.getPromise().then(function (buttonId) {
                        if (buttonId == "download") {
                            var packageInstallation = Package.installFromURL(LIVE_DICTIONARIES_PATH);
                            var installPromise = packageInstallation.promise;
                            var self = this;
                            installPromise.always(function (d) {
                                CommandManager.execute(Commands.APP_RELOAD);
                            });
                        }
                    });

                }
            }
            console.log(err, modtime, isdir, size, realPath);
        });

        Preferences.getPreferencesSystem().on("change", _updateEnvironment);

        MainViewManager.on("currentFileChange", _updateEnvironment);
        MainViewManager.on("activePaneChange", _updateEnvironment);

        LanguageManager.on("languageModified", _updateEnvironment);

        StyleManager.setup();
        // Set the initial locale.
        EditorManager.setLocale(Preferences.localeName);
        _updateEnvironment();
    });

});
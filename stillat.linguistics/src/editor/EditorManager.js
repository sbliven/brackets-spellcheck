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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, window, brackets */

/**
 * EditorManager handles the UI interactions for the spelling and grammar extensions.
 */
define(function (require, exports, module) {
    "use strict";

    var EditorManager = brackets.getModule("editor/EditorManager"),
        SpellChecker = require("src/spelling/SpellChecker"),
        Menus = brackets.getModule("command/Menus"),
        EditorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU),
        AppInit = brackets.getModule("utils/AppInit"),
        StringUtils = require("src/utils/Strings"),
        CommandManager = brackets.getModule("command/CommandManager"),
        StatusBar = brackets.getModule("widgets/StatusBar");

    var COMMAND_NO_SUGGESTIONS = "linguistics.noSuggestions";

    var COMMAND_IGNORE_WORD = "linguistics.ignoreWordForSession";
    var COMMAND_IGNORE_ONCE = "linguistics.ignoreWordOnce";

    var ALICE_IGNORE_MARKING = "alice-ignore";

    var _firstDividerAlreadyCreated = false;

    /**
     * Used to store the active editor range.
     */
    var EDITOR_ACTIVE_RANGE = null;
    
    /**
     * Indicates if the spell checker is enabled or not.
     *
     * @type {boolean}
     */
    var _spellCheckEnabled = false;

    /**
     * The supported CodeMirror modes.
     *
     * @type {Array}
     */
    var _validCodeMirrorModes = [
        "null",
        "markdown",
        "gfm",
        "aliceMarkdown",
        "deskMarkdown"
    ];

    var editorsWithGutters = [];
    
    /**
     * The spell checker overlay instance.
     * 
     * We need to keep track of this using a local variable so that
     * we can reliably remove it from CodeMirror instances.
     *
     * @type {Object}
     */
    var _spellCheckOverlay = SpellChecker.getOverlay();

    /**
     * Determines if a CodeMirror instance has a supported mode for spell checking.
     * @private
     * 
     * @param   {Object}  codeMirror The CodeMirror instance. 
     * @returns {boolean}
     */
    function _isValidMode(codeMirror) {
        return true;
        
        // It may be required to later revert this function
        // to check the mode to see if it is valid or not.
        // var _modeName = codeMirror.getMode().name;
        // return (_validCodeMirrorModes.indexOf(_modeName) > -1);
    }

    /**
     * Determines if a CodeMirror instance already has the spell checker overlay.
     * 
     * @private
     * @param   {object}  codeMirror The CodeMirror instance.
     * @returns {boolean}
     */
    function _editorHasSpellCheckOverlay(codeMirror) {

        if (typeof codeMirror.state === 'undefined' || typeof codeMirror.state.overlays === 'undefined') {
            return false;
        }

        if (codeMirror.state.overlays.length === 0) {
            return false;
        }

        var _foundOverlay = false;

        codeMirror.state.overlays.forEach(function (element, index, array) {
            if (typeof element.mode.spellCheckOverlay !== 'undefined') {
                _foundOverlay = true;
            }
        });

        return _foundOverlay;
    }

    function prepareGutter(editor) {
        // add our gutter if its not already available
        var cm = editor._codeMirror;

        var gutterName = "spelling-errors";

        var gutters = cm.getOption("gutters").slice(0);
        if (gutters.indexOf(gutterName) === -1) {
            gutters.unshift(gutterName);
            cm.setOption("gutters", gutters);
        }

        if (editorsWithGutters.indexOf(editor) === -1) {
            editorsWithGutters.push(editor);
        }
    }

    function _getSpellingMarker() {
        var marker = document.createElement("div");
        marker.style.color = "#822";
        marker.innerHTML = "●";
        return marker;
    }

    function ignoreOnceAtSelection() {
        var editor = EditorManager.getActiveEditor(),
            cm = editor ? editor._codeMirror : null;
        
        if (cm) {
            var activeRange = EDITOR_ACTIVE_RANGE;

            cm.markText(activeRange.startCh, activeRange.endCh, {
                className: ALICE_IGNORE_MARKING
            });
        }
    }

    /**
     * Updates the CodeMirror instance by removing or adding overlays as necessary.
     */
    function updateInterface() {
        var editor = EditorManager.getActiveEditor(),
            cm = editor ? editor._codeMirror : null;

        if (cm) {
            var _hasValidMode = _isValidMode(cm);
            var _hasOverlay = _editorHasSpellCheckOverlay(cm);
            var _needsRefresh = false;
            SpellChecker.setModeName(cm.getMode().name);
            
            // Check if the editor needs to be refreshed. This is super important
            // as it will allow us to see "immediate" results in the active
            // document when switching languages. See the `_initialize`
            // function in `LocaleStatusBar` for information on how
            // this flag is set on the currently active editor.
            if (typeof editor.linguisticsRequestingRefresh !== "undefined" && editor.linguisticsRequestingRefresh) {
                _needsRefresh = true;
            }
            
            if (!_hasValidMode || _needsRefresh || !_spellCheckEnabled) {
                if (_hasOverlay) {
                    cm.setOption("styleSelectedText", false);
                    cm.removeOverlay(_spellCheckOverlay);
                    if (_needsRefresh) {
                        _hasOverlay = false;
                    } else {
                        cm.refresh();
                    }
                }
                
                // If we are not refreshing, let's just return.
                if (!_needsRefresh) {
                    return;
                }
            }
            
            if (_spellCheckEnabled && _hasValidMode && !_hasOverlay) {
                // The "styleSelectedText" option is not used by Brackets,
                // so we can take advantage of that later when we have
                // to implement the spell checking context menu.
                cm.setOption("styleSelectedText", true);
                cm.addOverlay(_spellCheckOverlay);
                cm.refresh();
            }
        }

    }

    /**
     * Sets the locale string used by the internal spell checker.
     * 
     * @param {string} localeName The locale name.
     */
    function setLocale(localeName) {
        SpellChecker.setLocaleName(localeName);
    }

    /**
     * Sets whether or not the spell checker is enabled.
     * 
     * @param {boolean} isEnabled Whether or not the spell checker is enabled.
     */
    function setSpellCheckEnabled(isEnabled) {
        var _needToUpdateInterface = (_spellCheckEnabled !== isEnabled);
        
        _spellCheckEnabled = isEnabled;
        SpellChecker.setSpellCheckEnabled(isEnabled);
        
        if (_needToUpdateInterface) {
            updateInterface();
        }
        
    }
    
    /**
     * Indicates whether the spell checker is enabled.
     * 
     * @returns {bool}
     */
    function isSpellCheckEnabled() {
        return _spellCheckEnabled;
    }
    
    function _isValidSelection(editor) {        
        if (editor.getSelections().length === 1) {
            var selection = editor.getSelection();

            if (selection.start.line === selection.end.line) {
                var selectedText = '';

                // Handles the case where we right click in a word without selections.
                if (selection.end.ch == selection.start.ch) {
                    var _codeMirrorRange = editor._codeMirror.findWordAt(editor._codeMirror.getCursor());
                    selectedText = editor._codeMirror.getRange(_codeMirrorRange.anchor, _codeMirrorRange.head);
                    EDITOR_ACTIVE_RANGE = {
                        line: selection.start.line,
                        startCh: _codeMirrorRange.anchor,
                        endCh: _codeMirrorRange.head
                    };
                } else {
                    selectedText = editor.document.getRange(selection.start, selection.end);
                    EDITOR_ACTIVE_RANGE = {
                        line: selection.start.line,
                        startCh: selection.start,
                        endCh: selection.end
                    };
                }

                // The check that determines if a selection contains word separators could later
                // be expanded on so that snake_cased_words are allowed, and any leading or
                // trailing word separators are appropriately accounted for.
                if (StringUtils.containsWordSeparator(selectedText) === false) {
                    return selectedText;
                }
            }
        
        }

        return false;
    }

    function _selectionContainsSpellingError(selectedWord) {
        // Note: this used to use an unreliable method of checking CSS classes
        // or attempting to determine if the current position has some
        // marker from the underlying CodeMirror instance. Checking
        // if the word is simply mispelled again is much more
        // reliable and has a negligible impact on perf.
        return !SpellChecker._hasCorrectSpelling(selectedWord);
    }
    
    var _suggestions = [];
    var _createdContextMenuCommands = [];
    var _createdMenuCommandPrefix = "stillat.linguistics.command";
    var _numberOfCreatedMenuCommands = 0;
    var _createdMenuItems = [];
    
    function _getNewContextMenuCommandId() {
        _numberOfCreatedMenuCommands++;
        return _createdContextMenuCommands + _numberOfCreatedMenuCommands;
    }
    
    function _handleNoSuggestions() {
        return;
    }
    
    function _cleanupSpellingContextMenu() {
        if (_createdMenuItems.length > 0) {
            _createdMenuItems.forEach(function (item, index, array) {
                try {
                    if (item.isDivider) {
                        EditorContextMenu.removeMenuDivider(item);
                    } else {
                        if (typeof item !== 'undefined' && typeof item._command !== 'undefined') {
                            EditorContextMenu.removeMenuItem(item._command._id);
                        }
                    }
                } catch (e) {
                }
            });
            _createdMenuItems = [];
        }
    }
    
    function _replaceSelectionWith(newWord) {
        var editor = EditorManager.getActiveEditor(),
            cm = editor ? editor._codeMirror : null;
        
        if (cm) {
            // We will use the EDITOR_ACTIVE_RANGE variable
            // and the CodeMirror API to make the final
            // spelling adjustment for the end user.
            cm.replaceRange(
                newWord,
                {
                    line: EDITOR_ACTIVE_RANGE.line,
                    ch: EDITOR_ACTIVE_RANGE.startCh.ch
                },
                {
                    line: EDITOR_ACTIVE_RANGE.line,
                    ch: EDITOR_ACTIVE_RANGE.endCh.ch
                }
            );
        }
    }
    
    function _handleContextMenuOpen() {
        // Show the busy indicator so the user knows that something
        // is happening behind the scenes. The suggestion system
        // can take a while to return, based on the length of
        // the word that is being looked up.
        StatusBar.showBusyIndicator();
        
        // Reset the suggestions.
        _suggestions = [];
        
        // The "beforeContextMenuClose" event is not consistent about
        // when it is fired. For example, clicking into the editor
        // window to close a context menu will not cause that
        // event to fire. Because of this, we will just do
        // cleanup before the menu is opened. Not ideal,
        // but it does work, and is consistent enough.
        _cleanupSpellingContextMenu();
        
        var editor = EditorManager.getActiveEditor();
        var selectedWord = _isValidSelection(editor);
        if (selectedWord !== false) {
            var isSpellingError = _selectionContainsSpellingError(selectedWord);
            if (isSpellingError) {
                _suggestions = SpellChecker.suggest(selectedWord);

                /*
                if (!_firstDividerAlreadyCreated) {
                    var _beforeOptsMenuDivider = EditorContextMenu.addMenuDivider();
                    _createdMenuItems.push(_beforeOptsMenuDivider);
                    _firstDividerAlreadyCreated = true;
                    console.log('adding divider?');
                }*/

                // Context menu item to ignore all occurrences throughout the writing session.
                var addToIgnoreList = _getNewContextMenuCommandId();
                CommandManager.register("Ignore All", addToIgnoreList, function () {
                    SpellChecker.ignoreWord(selectedWord);
                    updateInterface();
                });
                var _ignoreMenuItem = EditorContextMenu.addMenuItem(addToIgnoreList);
                _createdMenuItems.push(_ignoreMenuItem);

                // Context menu item to ignore just the one occurrence throughout the writing session.
                var ignoreOnce = _getNewContextMenuCommandId();
                CommandManager.register("Ignore Once", ignoreOnce, function () {
                    ignoreOnceAtSelection();
                });
                var _ignoreOnceMenuItem = EditorContextMenu.addMenuItem(ignoreOnce);
                _createdMenuItems.push(_ignoreOnceMenuItem);

               // var _afterOptsMenuDivider = EditorContextMenu.addMenuDivider();
               // _createdMenuItems.push(_afterOptsMenuDivider);

                if (_suggestions.length > 0) {
                    // If we have suggestions, we should add a context
                    // menu item for each suggestion. Clicking on a
                    // suggestion in the menu should automatically
                    // replace the misspelled word for the user.
                    _suggestions.forEach(function (suggestion, index, array) {
                        var _newMenuCommand = _getNewContextMenuCommandId();
                        CommandManager.register(suggestion, _newMenuCommand, function () {
                            _replaceSelectionWith(suggestion);
                            EditorContextMenu.close();
                        });
                        var menuItem = EditorContextMenu.addMenuItem(_newMenuCommand);
                        _createdMenuItems.push(menuItem);
                    });
                } else {
                    // If there are no suggestions, we can add a few
                    // "placeholder" menu items to give some sort
                    // of feedback to the user to ensure them
                    // that the spell checker is running.
                    var menuItem = EditorContextMenu.addMenuItem(COMMAND_NO_SUGGESTIONS);
                    _createdMenuItems.push(menuItem);
                }
            }
        }
        
        // Hide the busy indicator.
        StatusBar.hideBusyIndicator();
    }
    
    function getActiveContents() {
        var editor = EditorManager.getActiveEditor(),
            cm = editor ? editor._codeMirror : null;
            
        if (cm) {
            return cm.getValue();
        }
        
        return null;
    }
    
    AppInit.appReady(function () {
        CommandManager.register("No spelling suggestions", COMMAND_NO_SUGGESTIONS, _handleNoSuggestions);
        EditorContextMenu.on("beforeContextMenuOpen", _handleContextMenuOpen);
    });

    exports.updateInterface = updateInterface;
    exports.setLocale = setLocale;
    exports.setSpellCheckEnabled = setSpellCheckEnabled;
    exports.isSpellCheckEnabled = isSpellCheckEnabled;
    exports.getActiveContents = getActiveContents;

});
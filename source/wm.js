/*
wm.js (C) acdra1n 2020. Licensed under GNU GPLv3.
*/

/**
 * Polyfills (for IE support and other unknown browsers)
 *     Element.matches => https://developer.mozilla.org/en-US/docs/Web/API/Element/matches#Polyfill
 *     Object.assign => https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
 */

/** Object.assign polyfill */

if (typeof Object.assign !== 'function') {
    // Must be writable: true, enumerable: false, configurable: true
    Object.defineProperty(Object, "assign", {
        value: function assign(target, varArgs) { // .length of function is 2
            'use strict';
            if (target === null || target === undefined) {
                throw new TypeError('Cannot convert undefined or null to object');
            }

            var to = Object(target);

            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];

                if (nextSource !== null && nextSource !== undefined) {
                    for (var nextKey in nextSource) {
                        // Avoid bugs when hasOwnProperty is shadowed
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }
            }
            return to;
        },
        writable: true,
        configurable: true
    });
}

/* Element.matches polyfill */

if (!Element.prototype.matches) {
    Element.prototype.matches = 
        Element.prototype.matchesSelector || 
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector || 
        Element.prototype.oMatchesSelector || 
        Element.prototype.webkitMatchesSelector ||
        function(s) {
            var matches = (this.document || this.ownerDocument).querySelectorAll(s), i = matches.length;
            while (--i >= 0 && matches.item(i) !== this) {}
            return i > -1;            
        };
}

/* ========================================================================================================================= */

/**
 * Main WMJS namespace.
 */
const WMJS = (function() {
    /**
     * WMJS utility namespace.
     */
    const util = (function(){
        /* Draggable utility */
        
        var dragTarget = null;
        var mousePosRel = { x: 0, y: 0 }; // Mouse position relative to element.

        window.onload = ()=> {
            document.body.addEventListener('mouseup', function() {
                if(!dragTarget)
                    return;
                
                const bounds = dragTarget.getBoundingClientRect();
                
                dragTarget.querySelectorAll("iframe").forEach((frame)=>{
                    frame.style.pointerEvents = frame._drag_pointerEvents_og;
                    delete frame._drag_pointerEvents_og;
                });

                dragTarget._drag.ondragend?.call(dragTarget._drag, dragTarget, { x: bounds.x + 'px', y: bounds.y + 'px' });
                dragTarget = null;
            });
        
            document.body.addEventListener('mousemove', function(e) {
                if(!dragTarget)
                    return;
                
                const left = (e.x - mousePosRel.x) + "px";
                const top = (e.y - mousePosRel.y) + "px";

                dragTarget._drag.ondrag?.call(dragTarget._drag, dragTarget, { x: left, y: top });
        
                dragTarget.style.left = left;
                dragTarget.style.top = top;
            });
        }

        /**
         * Makes an element draggable.
         * @param {HTMLElement} element The element to make draggable.
         * @param {Object} opts The options to use to make an element draggable.
         */
        function _draggable(element, opts) {
            if(opts == "destroy") {
                if(!element._drag)
                    return;

                element.removeEventListener('mousedown', element._drag._evt_mousedown);
                delete element._drag;
                return;
            }

            if(element._drag)
                return;

            const options = {};

            Object.assign(options, {
                ondragstart: null,
                ondrag: null,
                ondragend: null,
                cancel: ""
            }, opts);

            options.cancel = options.cancel.split(',');

            options._evt_mousedown = function(e) {
                for(let i = 0; i < options.cancel.length; i++) {
                    const selector = options.cancel[i];
                    
                    let parEl = e.target;
                    while(parEl != null) {
                        if(parEl.matches(selector))
                            return;
                        
                        parEl = parEl.parentElement;
                    }
                }

                var rect = e.target.getBoundingClientRect();
                var rx = e.clientX - rect.left;
                var ry = e.clientY - rect.top;

                mousePosRel = {
                    x: rx,
                    y: ry
                }

                dragTarget = element;

                element.querySelectorAll("iframe").forEach((frame)=>{
                    frame._drag_pointerEvents_og = frame.style.pointerEvents;
                    frame.style.pointerEvents = "none";
                });

                options.ondragstart?.call(options, element, { rx: rx + "px", ry: ry + "px" });
            }

            element._drag = options;
            element.addEventListener('mousedown', options._evt_mousedown);
        }

        return {
            draggable: _draggable
        }
    })();

    /* ========================================================================================================================= */

    /**
     * [Internal] Window manager window object.
     */
    class WM_Window {
        /**
         * Constructs a new window object.
         * @param {WindowManager} wm The window manager.
         */
        constructor(wm) {
            /** @type {HTMLElement} */
            this.baseElement = document.createElement('div');

            this.registered = false;
            this.shown = false;
            this.maximized = false;

            /** @type {WindowManager} */
            this.wm = wm;
            this.id = 0;

            /* Events */
            this.onopen = function(e) { }
            this.onclose = function(e) { }
            this.onshown = function(e) { }
            this.onmaximize = function(e) { }
            this.onminimize = function(e) { }
            this.onrestore = function(e) { }
            this.onactivate = function(e) { }
            this.ondeactivate = function(e) { }
        }

        /**
         * [Internal] Creates the window and its components.
         * @param params The window creation parameters to use.
         */
        _createWindow(params) {
            // 1 - Construct window
            this.baseElement.classList.add('wm-window');
            this.baseElement.style.zIndex = (this.wm.zIndexStartOffset + this.id + 1);

            //  1.1 - Construct titlebar
            const titleBar = document.createElement('div');
            titleBar.classList.add('titlebar');

            const titleBarTitle = document.createElement('span');
            titleBarTitle.classList.add('title');

            const controlBox = document.createElement('div');
            controlBox.classList.add('control-box');
            controlBox.insertAdjacentHTML('beforeend', '<button role="minimize">─</button>'
             + (params.resizable ? '<button role="maximize">▢</button>' : '') //TODO check if window is resizable
             + '<button role="close">✕</button>');

            if(params.resizable) {
                titleBarTitle.addEventListener('dblclick', ()=>{
                    this.toggleMaximize();
                });

                controlBox.querySelector('button[role="maximize"]').addEventListener('click', ()=>{
                    this.toggleMaximize();
                });

                controlBox.querySelector('button[role="minimize"]').addEventListener('click', ()=>{
                    this.hide();
                    this.onminimize?.call();
                });

                controlBox.querySelector('button[role="close"]').addEventListener('click', ()=>{
                    this.onclose?.call();
                    this.close();
                });
            }

            titleBar.appendChild(titleBarTitle);
            titleBar.appendChild(controlBox);

            //  1.2 - Construct contents container
            const contentsContainer = document.createElement('div');
            contentsContainer.classList.add('content');

            // 2 - Apply parameters
            this.baseElement.style.position = "absolute";
            this.baseElement.style.height = (typeof params.height == 'string') ? params.height : params.height + "px";
            this.baseElement.style.width = (typeof params.width == 'string') ? params.width : params.width + "px";
            this.baseElement.style.left = (typeof params.x == 'string') ? params.x : params.x + "px";
            this.baseElement.style.top = (typeof params.y == 'string') ? params.y : params.y + "px";

            titleBarTitle.innerText = params.title;

            //  2.1 - Register components
            this.baseElement.appendChild(titleBar);
            this.baseElement.appendChild(contentsContainer);
            this.baseElement.addEventListener('mousedown', ()=>{
                this.activate();
            });

            // 3 - Create draggable handler (resize is still WIP)
            if(params.draggable)
                this.setDraggable();
        }

        /**
         * [Internal] Registers the window.
         */
        _registerWindow() {    
            this.wm.container.appendChild(this.baseElement);
            this.registered = true;
        }

        /**
         * [Internal] Makes the window draggable.
         */
        setDraggable(enabled = true) {
            if(enabled) {
                util.draggable(this.baseElement, {
                    cancel: ".content,.control-box,.ui-resizable-handle"
                });
            } else
                util.draggable(this.baseElement, "destroy");
        }
        
        /**
         * Toggles whether the window is maximized.
         */
        toggleMaximize() {
            if(!this.maximized) {
                this._ogBounds = {
                    height: this.baseElement.style.height,
                    width: this.baseElement.style.width,
                    x: this.baseElement.style.left,
                    y: this.baseElement.style.top
                };

                this.baseElement.style.height = "100%";
                this.baseElement.style.width = "100%";
                this.baseElement.style.left = "0px";
                this.baseElement.style.top = "0px";

                this.baseElement.classList.add('maximized');
                this.maximized = true;
                this.setDraggable(false);

                this.onmaximize?.call();
            } else {
                this.baseElement.style.height = this._ogBounds.height;
                this.baseElement.style.width = this._ogBounds.width;
                this.baseElement.style.left = this._ogBounds.x;
                this.baseElement.style.top = this._ogBounds.y;

                this.baseElement.classList.remove('maximized');
                this.maximized = false;
                this.setDraggable(true);

                this.onrestore?.call();
            }
        }

        /**
         * Return a rectangle containing the bounds of the current window.
         */
        getWindowRect() {
            const boundRect = this.baseElement.getBoundingClientRect();
            
            return {
                x: boundRect.x,
                y: boundRect.y,
                height: boundRect.height,
                width: boundRect.width
            };
        }

        /**
         * Returns the content container element (essentially the element used for window contents).
         * @returns {HTMLElement} The content container element.
         */
        getContentContainer() {
            return this.baseElement.querySelector('.content');
        }

        /**
         * Activates the window
         */
        activate() {
            if(this.baseElement.classList.contains('active'))
                return;

            this.wm.activate(this);
            this.onactivate?.call();
        }

        /**
         * Shows the window. If the window is already shown, this function will do nothing.
         */
        show() {
            if(this.shown)
                return;
            
            if(!this.registered) {
                this._registerWindow();
                this.onopen?.call();
            }
            
            this.baseElement.style.display = "flex";
            this.shown = true;

            this.onshown?.call();

            this.activate();
        }

        /**
         * Hides the window. `onminimize` only gets called if it is performed via the UI.
         */
        hide() {
            if(!this.shown) return;

            this.baseElement.style.display = "none";
            this.shown = false;
        }

        /**
         * Closes the window. Once it has been closed, the window is destroyed.
         */
        close() {
            this.wm.destroy(this);
        }
    }

    /**
     * Window manager class.
     */
    class WindowManager {
        /**
         * Creates a new window manager.
         * @param {String|HTMLElement} containerEl The container element to use for the window manager.
         */
        constructor(containerEl) {
            // Check if provided container is a valid element.

            if(!(containerEl instanceof HTMLElement))
                containerEl = document.querySelector(containerEl);
        
            if(!containerEl)
                throw new Error("The specified container element is not valid.");

            if(containerEl._wm)
                throw new Error("The specified container already has a window manager.");

            /** Variables */
            this.container = containerEl;
            /** @type {WM_Window[]} */
            this.windows = [];
            this.zIndexStartOffset = 10;

            /** Internal variables (these should not be touched and are therefore prefixed) */
            this._createdWindows = 0;

            containerEl._wm = {};
        }

        /**
         * Creates a new empty window.
         * @param params The window parameters to use.
         * @returns {WM_Window} The newly created window object.
         */
        createWindow(params) {
            const options = {};

            Object.assign(options, {
                title: "Untitled",
                height: 315,
                width: 450,
                x: 10,
                y: 10,
                resizable: true,
                draggable: true
            }, params);

            const wnd = new WM_Window(this, options);
            wnd.id = (this._createdWindows++);
            wnd._createWindow(options);
            this.windows.push(wnd);
            return wnd;
        }

        /**
         * Finds a window by id.
         * @param {Number} id The ID of the window to find.
         */
        findWindow(id) {
            return this.windows.find((x)=>x?.id == id);
        }

        /**
         * Destroys all windows. No events will be executed upon destruction.
         */
        destroyAll() {
            this.windows.forEach((v, i)=>{
                this.container.removeChild(v.baseElement);
                v.wm = null;
                v.baseElement = null;
                this.windows[i] = null;
                delete this.windows[i];
            });
        }

        /**
         * Destroys a window.
         * @param {WM_Window|Number} _wnd The window to destroy.
         */
        destroy(_wnd) {
            const wnd = (_wnd instanceof WM_Window) ? _wnd : this.findWindow(_wnd);

            if(!wnd.wm)
                return;

            this.container.removeChild(wnd.baseElement);
            wnd.baseElement = null;
            const wndIndex = this.windows.indexOf(wnd);
            this.windows[wndIndex] = null;
            delete this.windows[wndIndex];
        }

        /**
         * Activates a window.
         * @param {WM_Window|Number} _wnd The window to activate.
         */
        activate(_wnd) {
            const wnd = (_wnd instanceof WM_Window) ? _wnd : this.findWindow(_wnd);
            var highestZIndex = parseInt(wnd.baseElement.style.zIndex);

            this.windows.forEach((w, i, a)=>{
                if((a[i] == null) || (a[i].id == wnd.id))
                    return;
                
                if(a[i].baseElement.classList.contains('active')) {
                    a[i].baseElement.classList.remove('active');
                    a[i].ondeactivate?.call();
                }

                const zIndex = parseInt(w.baseElement.style.zIndex);

                if(zIndex > highestZIndex) {
                    highestZIndex = zIndex;
                }
            });

            wnd.baseElement.style.zIndex = highestZIndex + 1;
            wnd.baseElement.classList.add('active');
        }
    }

    return {
        WindowManager,
        util
    }
})();

window.WMJS = WMJS;
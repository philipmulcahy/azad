/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */
// Uses code from http://eloquentjavascript.net/1st_edition/appendix2.html

/* jshint strict: true, esversion: 6 */
/* jslint node:true */

'use strict';

import cachestuff from './cachestuff';

class BinaryHeap {
    constructor(scoreFunction) {
        this.content = [];
        this.scoreFunction = scoreFunction;
    }

    push(element) {
        // Add the new element to the end of the array.
        this.content.push(element);
        // Allow it to bubble up.
        this.bubbleUp(this.content.length - 1);
    }

    pop() {
        // Store the first element so we can return it later.
        const result = this.content[0];
        // Get the element at the end of the array.
        const end = this.content.pop();
        // If there are any elements left, put the end element at the
        // start, and let it sink down.
        if (this.content.length > 0) {
            this.content[0] = end;
            this.sinkDown(0);
        }
        return result;
    }

    remove(node) {
        const length = this.content.length;
        // To remove a value, we must search through the array to find
        // it.
        for (let i = 0; i < length; i++) {
            if (this.content[i] !== node) continue;
            // When it is found, the process seen in 'pop' is repeated
            // to fill up the hole.
            const end = this.content.pop();
            // If the element we popped was the one we needed to remove,
            // we're done.
            if (i === length - 1) break;
            // Otherwise, we replace the removed element with the popped
            // one, and allow it to float up or sink down as appropriate.
            this.content[i] = end;
            this.bubbleUp(i);
            this.sinkDown(i);
            break;
        }
    }

    size() {
        return this.content.length;
    }

    bubbleUp(n) {
        // Fetch the element that has to be moved.
        const element = this.content[n], score = this.scoreFunction(element);
        // When at 0, an element can not go up any further.
        while (n > 0) {
            // Compute the parent element's index, and fetch it.
            const parentN = Math.floor((n + 1) / 2) - 1,
                parent = this.content[parentN];
            // If the parent has a lesser score, things are in order and we
            // are done.
            if (score >= this.scoreFunction(parent))
                break;

            // Otherwise, swap the parent with the current element and
            // continue.
            this.content[parentN] = element;
            this.content[n] = parent;
            n = parentN;
        }
    }

    sinkDown(n) {
        // Look up the target element and its score.
        const length = this.content.length;
        const element = this.content[n];
        const elemScore = this.scoreFunction(element);

        for (;;) {
            // Compute the indices of the child elements.
            const child2N = (n + 1) * 2;
            const child1N = child2N - 1;
            // This is used to store the new position of the element,
            // if any.
            let swap = null;
            let child1Score = null;
            // If the first child exists (is inside the array)...
            if (child1N < length) {
                // Look it up and compute its score.
                const child1 = this.content[child1N];
                child1Score = this.scoreFunction(child1);
                // If the score is less than our element's, we need to swap.
                if (child1Score < elemScore)
                    swap = child1N;
            }
            // Do the same checks for the other child.
            if (child2N < length) {
                const child2 = this.content[child2N];
                const child2Score = this.scoreFunction(child2);
                if (child2Score < ( !swap ? elemScore : child1Score))
                    swap = child2N;
            }

            // No need to swap further, we are done.
            if ( !swap ) break;

            // Otherwise, swap and continue.
            this.content[n] = this.content[swap];
            this.content[swap] = element;
            n = swap;
        }
    }
}

class RequestScheduler {
    constructor() {
        // chrome allows 6 requests per domain at the same time.
        this.CONCURRENCY = 6;  // Chrome allows 6 connections per server.
        this.cache = cachestuff.createLocalCache('REQUESTSCHEDULER');
        this.queue = new BinaryHeap( item => item.priority );
        this.running_count = 0;
        this.completed_count = 0;
        this.error_count = 0;
        this.signin_warned = false;
        this.updateProgress();
    }

    schedule(query, event_converter, callback, priority, nocache) {
        const cached_response = nocache ?
            undefined :
            this.cache.get(query);
        if (cached_response !== undefined) {
            console.log('Already had ' + query + ' with ' + this.queue.size());
            callback(cached_response, query);
        } else {
            console.log('Scheduling ' + query + ' with ' + this.queue.size());
            if (this.running_count < this.CONCURRENCY) {
                this.execute(query, event_converter, callback, priority);
            } else {
                this.queue.push({
                    'query': query,
                    'event_converter': event_converter,
                    'callback': callback,
                    'priority': priority,
                });
            }
        }
    }

    clearCache() {
        this.cache.clear();
    }

    execute(query, event_converter, callback, priority) {
        console.log(
            'Executing ' + query +
            ' with queue size ' + this.queue.size() +
            ' and priority ' + priority
        );
        const req = new XMLHttpRequest();
        req.open('GET', query, true);
        req.onerror = function() {
            this.running_count -= 1;
            this.error_count += 1;
            if ( typeof(this.updateProgress) === 'function' ) {
                this.updateProgress();
            } else {
                alert('Try again; there seems to be a connection issue');
            }
            console.log( 'Unknown error fetching ' + query );
        };
        req.onload = function(evt) {
            this.running_count -= 1;
            if ( req.status !== 200 ) {
                this.error_count += 1;
                console.log(
                    'Got HTTP' + req.status + ' fetching ' + query);
                return;
            }
            if ( req.responseURL.includes('/ap/signin?') ) {
                this.error_count += 1;
                console.log('Got sign-in redirect from: ' + query);
                if ( !this.signin_warned ) {
                    alert('Amazon Order History Reporter Chrome Extension\n\n' +
                          'It looks like you might have been logged out of Amazon.\n' +
                          'Sometimes this can be "partial" - some types of order info stay logged in and some do not.\n' +
                          'I will now attempt to open a new tab with a login prompt. Please use it to login,\n' +
                          'and then retry your chosen orange button.');
                    this.signin_warned = true;
                    chrome.runtime.sendMessage(
                        {
                            action: 'open_tab',
                            url: query
                        }
                    );
                }
                return;
            }
            this.completed_count += 1;
            console.log(
              'Finished ' + query +
                ' with queue size ' + this.queue.size());
            while (this.running_count < this.CONCURRENCY &&
                   this.queue.size() > 0
            ) {
                const task = this.queue.pop();
                this.execute(
                    task.query,
                    task.event_converter,
                    task.callback,
                    task.priority
                );
            }
            const converted = event_converter(evt);
            this.cache.set(query, converted);
            callback(converted, query);
        }.bind(this);
        this.running_count += 1;
        req.send();
        this.updateProgress();
    }

    statistics() {
        return {
            'queued' : this.queue.size(),
            'running' : this.running_count,
            'completed' : this.completed_count,
            'errors' : this.error_count,
            'cache_hits' : this.cache.hitCount(),
        };
    }

    updateProgress() {
        try {
            const target = document.getElementById('order_reporter_progress');
            if (target !== null) {
                target.textContent = Object.entries(this.statistics())
                                           .map(([k,v]) => {return k + ':' + v;})
                                           .join('; ');
            }
            setTimeout(function() { this.updateProgress(); }.bind(this), 2000);
        } catch(ex) {
            console.warn('could not update progress - maybe we are in node?: ' + ex);
        }
    }
}

export default {
    create: function() {
        return new RequestScheduler();
    }
};

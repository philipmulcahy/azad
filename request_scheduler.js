/* Copyright(c) 2016 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

// Uses code from http://eloquentjavascript.net/1st_edition/appendix2.html

let amazon_order_history_request_scheduler = (function() {
    'use strict';

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
            let result = this.content[0];
            // Get the element at the end of the array.
            let end = this.content.pop();
            // If there are any elements left, put the end element at the
            // start, and let it sink down.
            if (this.content.length > 0) {
                this.content[0] = end;
                this.sinkDown(0);
            }
            return result;
        }

        remove(node) {
            let length = this.content.length;
            // To remove a value, we must search through the array to find
            // it.
            for (let i = 0; i < length; i++) {
                if (this.content[i] != node) continue;
                // When it is found, the process seen in 'pop' is repeated
                // to fill up the hole.
                let end = this.content.pop();
                // If the element we popped was the one we needed to remove,
                // we're done.
                if (i == length - 1) break;
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
            let element = this.content[n], score = this.scoreFunction(element);
            // When at 0, an element can not go up any further.
            while (n > 0) {
                // Compute the parent element's index, and fetch it.
                let parentN = Math.floor((n + 1) / 2) - 1,
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
            let length = this.content.length;
            let element = this.content[n];
            let elemScore = this.scoreFunction(element);

            while(true) {
                // Compute the indices of the child elements.
                let child2N = (n + 1) * 2, child1N = child2N - 1;
                // This is used to store the new position of the element,
                // if any.
                let swap = null;
                let child1Score = null;
                // If the first child exists (is inside the array)...
                if (child1N < length) {
                    // Look it up and compute its score.
                    let child1 = this.content[child1N];
                    child1Score = this.scoreFunction(child1);
                    // If the score is less than our element's, we need to swap.
                    if (child1Score < elemScore)
                        swap = child1N;
                }
                // Do the same checks for the other child.
                if (child2N < length) {
                    let child2 = this.content[child2N];
                    let child2Score = this.scoreFunction(child2);
                    if (child2Score < (swap == null ? elemScore : child1Score))
                        swap = child2N;
                }

                // No need to swap further, we are done.
                if (swap == null) break;

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
            this.queue = new BinaryHeap( item => item.priority );
            this.running_count = 0;
            this.completed_count = 0;
            this.error_count = 0;
            this.signin_warned = false;
            this.execute = function(query, callback, priority) {
                console.log(
                    'Executing ' + query +
                    ' with queue size ' + this.queue.size() +
                    ' and priority ' + priority
                );
                let req = new XMLHttpRequest();
                req.open('GET', query, true);
                req.onerror = function() {
                    this.running_count -= 1;
                    this.error_count += 1;
                    console.log(
                        'Unknown error fetching ' + query);
                };
                req.onload = function(evt) {
                    this.running_count -= 1;
                    if ( req.status != 200 ) {
                        this.error_count += 1;
                        console.log(
                            'Got HTTP' + req.status + ' fetching ' + query);
                        return;
                    }
                    if ( req.responseURL.includes('/ap/signin?') ) {
                        this.error_count += 1;
                        console.log('Got sign-in redirect.');
                        if ( !this.signin_warned ) {
                            alert('Amazon Order History Reporter Chrome Extension\n\n' +
                                  'It looks like you might have been logged out of Amazon.\n' +
                                  'Sometimes this can be "partial" - some types of order info stay logged in and some do not.\n' +
                                  'Please log out of amazon and log back in and then retry Amazon Order History Reporter');
                            this.signin_warned = true;
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
                        let task = this.queue.pop();
                        this.execute(task.query, task.callback, task.priority);
                    }
                    callback(evt);
                }.bind(this);
                this.running_count += 1;
                req.send();
                this.updateProgress();
            };
            this.statistics = function() {
                return {
                    'queued' : this.queue.size(),
                    'running' : this.running_count,
                    'completed' : this.completed_count,
                    'errors' : this.error_count
                };
            };
            this.updateProgress = function() {
                let target = document.getElementById('order_reporter_progress');
                if (target != null) {
                    target.textContent = Object.entries(this.statistics())
                                               .map(([k,v]) => {return k + ':' + v;})
                                               .join('; ');
                }
                setTimeout(function() { this.updateProgress(); }.bind(this), 2000);
            };
            this.updateProgress();
        }

        schedule(query, callback, priority) {
            console.log(
                'Scheduling ' + query + ' with ' + this.queue.size());
            if (this.running_count < this.CONCURRENCY) {
                this.execute(query, callback, priority);
            } else {
                this.queue.push({
                    'query': query,
                    'callback': callback,
                    'priority': priority
                });
            }
        }
    }

    return {
        create: function() {
            return new RequestScheduler();
        }
    };
})();

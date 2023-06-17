/* Copyright(c) 2020 Philip Mulcahy. */


export interface IProgressIndicator {
    update_progress: (fraction: number) => void;
};


// Emplace progress bar
// Returns:
//   function that permits caller to set the fraction complete
//   (float between 0 and 1)
export function addProgressBar(
    parent_element: HTMLElement
): IProgressIndicator {
    // remove any existing progress bar
    const elem = parent_element.querySelector('[class="azad_progress_bar"]');
    if ( elem !== null ) {
        console.log('removing existing progress indicator');
        elem.parentNode!.removeChild(elem);
    }

    console.log('Adding progress indicator');

    const border_width = 2;
    const inner_width = 250;
    const outer_width = 2*border_width + inner_width;

    const a = parent_element.ownerDocument.createElement('div');
    a.setAttribute('class', 'azad_progress_bar');
    a.setAttribute('title', 'how far through the scraping process we are');
    a.setAttribute('style', 'width:' + outer_width + 'px');
    parent_element.insertBefore(
        a,
        document.body.firstChild
    );

    const b = parent_element.ownerDocument.createElement('div');
    b.setAttribute('class', 'azad_progress_worm');
    b.setAttribute('style', 'width:0px');
    a.insertBefore(
        b,
        a.firstChild
    );

    const set_fraction_done = function(fraction: number) {
        const width = Math.trunc(inner_width * fraction);
        const percent_string = '' + Math.trunc(fraction * 100 + 0.005) + '%';
        b.setAttribute('style', 'width:' + width + 'px');
        b.setAttribute('title', percent_string);
    }

    return {
        update_progress: set_fraction_done
    }
}


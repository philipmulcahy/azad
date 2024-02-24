/* Copyright(c) 2024 Philip Mulcahy. */

export function addBanner(): void {
  removeBanner();
  const parent = document.body;
  console.log('Adding azad_banner');
  const a = document.createElement('div');
  a.setAttribute('class', 'azad_banner');
  a.setAttribute('title', 'show that we are doing stuff');
  a.innerHTML = `
<h2>Scraping Amazon order history</h2>
<table>
  <tr>
    <td>
      Your results table should appear on this tab.
      <br/>
      Until them, you can follow progress using the orange and blue progress
      bar above.
    </td>
    <td>
      <div class="azad_ad_container">
        Your message could go here
        in exchange for a suitable contribution to
        <a href="https://www.justgiving.com/azad-pah">
          Princess Alice Hospice
        </a>.
        <br/?
        Contact azad_extension@gmail.com if you're interested.
        <h4>Some initial small print</h4>
        <ol class="azad_small_print">
          <li>html only: no scripts, and I'm not at all sure about images.
            Why?
            <ul>
              <li>
                We don't want to risk a script breaking out and taking control
                of users' accounts.
              </li>
              <li> We don't want to annoy users. </li>
            </ul>
          </li>
          <li>
            I (Philip) get to decide what "suitable" means, both in terms of
            price, duration and content.
            <br/>
            I am not going to publish an exhaustive list of unacceptable
            content subjects and types,
            <br/>
            I reserve the right to reject proposals for any reason, and will
            not explain or debate rejections.
            <br/>
            If you think this might be a good venue to conduct your culture war
            , you are mistaken.
            <br/>
            This extension currently exists to support a charity that should
            offend no-one.
        </ol>
      </div>
    </td>
  </tr>
</table>
  `
  parent.insertBefore(
    a,
    parent.firstChild
  );
  parent.insertBefore(
    document.createElement('br'),
    parent.firstChild
  );
}

export function removeBanner(): void {
  const parent = document.body;
  const elem = parent.querySelector('[class="azad_banner"]');
  if ( elem !== null ) {
      console.log('removing existing azad_banner');
      elem.parentNode!.removeChild(elem);
  }
}

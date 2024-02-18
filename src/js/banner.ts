/* Copyright(c) 2024 Philip Mulcahy. */

export function addBanner(): void {
  removeBanner();
  const parent = document.body;
  console.log('Adding azad_banner');
  const a = document.createElement('div');
  a.setAttribute('class', 'azad_banner');
  a.setAttribute('title', 'show that we are doing stuff');
  a.innerHTML = 'Scraping Amazon order history';
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

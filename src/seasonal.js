/* Small stationery illustrations; independent of the exam and simulation clocks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeasonalIcon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const drawings = {
    spring: '<g stroke="#ba9690"><path d="M16 14C10 12 7 7 10 5Q13 3 16 7Q19 3 22 5C25 8 21 13 17 14C22 10 28 11 28 15Q28 19 22 19C27 22 23 28 20 26Q17 25 16 20C15 26 10 28 8 24Q6 21 11 18C5 19 3 14 6 12Q9 10 16 14Z" fill="#efd5d2"/><path d="M16 17Q16 23 13 28" fill="none"/><path d="M14 25Q8 23 7 27Q12 30 14 25Z" fill="#c6d3b7" stroke="#99ab8d"/><path d="M16 16L12 13M16 16L20 13M16 16L20 19M16 16L14 21" fill="none" stroke="#d3a49e"/><circle cx="16" cy="16" r="2.2" fill="#f4e4b5"/></g>',
    summer: '<g stroke="#b8a372"><path d="M16 10C9 5 13 1 16 6C19 1 23 5 21 9C27 6 30 11 25 14C31 16 27 21 23 20C25 26 19 28 17 23C14 29 9 26 10 22C4 24 2 19 7 16C1 13 5 8 10 10C7 4 12 3 14 9" fill="#efdf9e"/><path d="M16 21Q15 25 16 29M16 27Q21 21 25 24Q23 29 16 27Z" fill="#bdccad" stroke="#8eaa8e"/><circle cx="16" cy="15" r="6" fill="#c4ab84"/><path d="M13 13L14 14M18 12L19 13M13 17L14 18M18 17L19 18" stroke="#a08e70"/></g>',
    autumn: '<g stroke="#ac8772"><path d="M16 25C11 24 8 22 5 22L7 18 3 13 10 14 9 8 13 10 17 3 20 10 24 8 23 14 29 13 25 19 27 22Q21 22 16 25Z" fill="#d4a18a"/><path d="M16 28L17 10M17 21L10 17M17 17L22 13M17 23L23 20" fill="none"/><path d="M9 14L11 17M21 10L20 14" fill="none" stroke="#e8c0a6"/></g>',
    winter: '<g fill="none" stroke="#9eB6c2"><path d="M16 4V28M5.6 10L26.4 22M5.6 22L26.4 10"/><path d="M12 7L16 11 20 7M12 25L16 21 20 25M6 14L11 13 10 8M22 24L21 19 26 18M6 18L11 19 10 24M22 8L21 13 26 14" stroke="#b4c7ce"/><path d="M16 12L20 16 16 20 12 16Z" fill="#dce7e9"/></g>'
  };
  function seasonForMonth(month) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Month must be 1–12');
    return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
  }
  function monthAt(epoch = Date.now()) {
    return new Date(epoch + 8 * 60 * 60 * 1000).getUTCMonth() + 1;
  }
  function svgForMonth(month) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true" focusable="false" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' + drawings[seasonForMonth(month)] + '</svg>';
  }
  function mount(host) {
    let previous;
    return { update(epoch = Date.now()) {
      const month = monthAt(epoch), season = seasonForMonth(month);
      if (season !== previous) {
        host.innerHTML = svgForMonth(month);
        host.dataset.season = season;
        previous = season;
      }
    } };
  }
  return { seasonForMonth, monthAt, svgForMonth, mount };
});

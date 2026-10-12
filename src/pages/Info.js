import Page from './Page.js';
import { PALETTE } from '../gl/World.js';
import Finale from '../fx/Finale.js';
import magnetic from '../fx/magnetic.js';

/** About: who we are, then the same closing screen as the welcome page. */
export default class Info extends Page {
  constructor(opts) {
    super(opts);
    this.world?.setAccent('#' + PALETTE.accent.getHexString());
    const finale = this.el.querySelector('.finale');
    this.finaleFx = finale ? new Finale(finale) : null;
    this.unmagnet = magnetic([this.el.querySelector('.finale-button')]);
  }

  /* The closing screen goes with the rest of the page (as on the welcome
     page), rather than cutting out when it's swapped. */
  onLeave(tl) {
    const finale = this.el.querySelector('.finale');
    if (finale) tl.to(finale, { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0);
  }

  resize() {
    super.resize();
    this.finaleFx?.resize();
  }

  destroy() {
    super.destroy();
    this.unmagnet?.();
    this.finaleFx?.destroy();
  }
}

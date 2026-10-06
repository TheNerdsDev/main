import Page from './Page.js';
import { PALETTE } from '../gl/World.js';

export default class Info extends Page {
  constructor(opts) {
    super(opts);
    this.world?.setAccent('#' + PALETTE.accent.getHexString());
  }
}

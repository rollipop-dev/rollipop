export default function receiver() {
  'use strict';
  return this;
}

export const object = {
  method() {
    return this;
  },
};

export class Constructor {
  constructor() {
    this.value = 42;
  }
}

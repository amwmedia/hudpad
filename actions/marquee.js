const defaults = {speed: 0.15};
const size = 8;

module.exports = {
  update(state, ctx) {
    const {x, width, speed, text} = Object.assign({}, defaults, state);
    state.width = ctx.measureText(text).width;
    if (x == null) {
      state.x = size + speed;
    } else if (state && x != null) {
      state.x -= speed;
      if (x < (width * -1.1)) {
        state.x = size;
      }
    }
    return state;
  },
  draw({text, x}, ctx) {
    ctx.beginPath();
    ctx.clearRect(0, 0, size, size);
    ctx.fillText(text, x, 7);
  }
};

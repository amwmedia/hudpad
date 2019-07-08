const defaults = {speed: 0.1};
const size = 8;

module.exports = {
  update(state, ctx) {
    const {x, width, speed, text} = Object.assign({}, defaults, state);
    if (x == null) {
      state.width = ctx.measureText(text).width;
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

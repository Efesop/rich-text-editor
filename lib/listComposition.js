/**
 * Keys an input method is using, which a list item must leave alone.
 *
 * With a Japanese, Chinese or Korean input method, Enter confirms the text
 * being composed and Backspace edits it. When a list item acted on those
 * keys too, it split or rewrote the item under the composition, and the
 * confirmed text landed twice.
 *
 * Chrome and Firefox mark a keydown the input method is using with
 * `isComposing`. Safari sends the keydown for the Enter that confirms a
 * composition after compositionend, with `isComposing` false, but with
 * keyCode 229, like every key an input method takes.
 *
 * @param {KeyboardEvent} event - a keydown
 * @returns {boolean}
 */
export function isComposingKey (event) {
  return Boolean(event?.isComposing) || event?.keyCode === 229
}

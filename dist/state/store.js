/* eslint-disable no-param-reassign */
import { configureStore } from '../../snowpack/pkg/@reduxjs/toolkit.js';
import rootSlice from './rootSlice.js';
const {
  reducer
} = rootSlice;
const store = configureStore({
  reducer
});
export default store;
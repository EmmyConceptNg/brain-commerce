import { SET_CREDENTIALS } from './actions';

const initialState = {
  apiKey: '',
  storeId: '',
  // ...existing state...
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case SET_CREDENTIALS:
      return {
        ...state,
        apiKey: action.payload.apiKey,
        storeId: action.payload.storeId,
      };
    // ...existing cases...
    default:
      return state;
  }
};

export default reducer;

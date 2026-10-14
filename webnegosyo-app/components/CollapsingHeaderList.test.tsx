import React from "react";
import { Text, TextInput } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { CollapsingHeaderList } from "./CollapsingHeaderList";

const HEADER_HEIGHT = 180;

function renderList(data: string[], searchRef?: React.RefObject<TextInput | null>) {
  return render(
    <CollapsingHeaderList
      testID="list"
      data={data}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{item}</Text>}
      header={<Text>Big title</Text>}
      toolbar={<Text>Filters</Text>}
      emptyComponent={<Text>Nothing here</Text>}
      searchInputRef={searchRef}
    />,
  );
}

function measureHeader(list: ReturnType<typeof renderList>) {
  // The wrapper that measures the header is the nearest ancestor with onLayout.
  let header = list.getByText("Big title").parent;
  while (header && !header.props.onLayout) header = header.parent;
  if (!header) throw new Error("header wrapper not found");
  fireEvent(header, "layout", { nativeEvent: { layout: { height: HEADER_HEIGHT } } });
}

function scrollTo(list: ReturnType<typeof renderList>, y: number) {
  fireEvent.scroll(list.getByTestId("list"), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 390, height: 3000 },
      layoutMeasurement: { width: 390, height: 800 },
    },
  });
}

describe("CollapsingHeaderList", () => {
  it("renders the header, the filters and every row", () => {
    // Arrange + Act
    const list = renderList(["Adobo", "Sinigang"]);

    // Assert
    expect(list.getByText("Big title")).toBeTruthy();
    expect(list.getByText("Filters")).toBeTruthy();
    expect(list.getByText("Adobo")).toBeTruthy();
    expect(list.getByText("Sinigang")).toBeTruthy();
    expect(list.queryByText("Nothing here")).toBeNull();
  });

  it("keeps the filters reachable when they filtered everything out", () => {
    // Arrange + Act
    const list = renderList([]);

    // Assert
    expect(list.getByText("Filters")).toBeTruthy();
    expect(list.getByText("Nothing here")).toBeTruthy();
  });

  it("docks the filters as child 1, under the scroll-away header", () => {
    // Arrange + Act
    const list = renderList(["Adobo"]);

    // Assert
    expect(list.getByTestId("list").props.stickyHeaderIndices).toEqual([1]);
  });

  it("offers the search button only once the header has scrolled away", () => {
    // Arrange
    const searchRef = React.createRef<TextInput>();
    const list = renderList(["Adobo"], searchRef);
    measureHeader(list);

    // Act + Assert: at the top the field itself is on screen.
    expect(list.queryByLabelText("Search")).toBeNull();
    scrollTo(list, HEADER_HEIGHT + 40);
    expect(list.getByLabelText("Search")).toBeTruthy();
  });

  it("brings the field back and focuses it from the docked button", () => {
    // Arrange
    jest.useFakeTimers();
    const focus = jest.fn();
    const searchRef = { current: { focus } as unknown as TextInput };
    const list = renderList(["Adobo"], searchRef);
    measureHeader(list);
    scrollTo(list, HEADER_HEIGHT + 40);

    // Act
    fireEvent.press(list.getByLabelText("Search"));
    act(() => {
      jest.runAllTimers();
    });

    // Assert
    expect(focus).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

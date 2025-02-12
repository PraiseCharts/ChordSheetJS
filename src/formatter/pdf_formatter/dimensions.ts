import { ColumnConfig, LayoutConfig } from './types';

class Dimensions {
  pageWidth: number;

  pageHeight: number;

  layoutConfig: LayoutConfig;

  columns: ColumnConfig;

  constructor(pageWidth: number, pageHeight: number, layoutConfig: LayoutConfig, columns: ColumnConfig) {
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
    this.layoutConfig = layoutConfig;
    this.columns = columns;
  }

  get margins() {
    return this.layoutConfig.global.margins;
  }

  get minX() {
    return this.margins.left;
  }

  get maxX() {
    return this.pageWidth - this.margins.right;
  }

  get minY() {
    return this.margins.top + this.layoutConfig.header.height;
  }

  get maxY() {
    return this.pageHeight - this.margins.bottom;
  }

  get columnWidth(): number {
    const { columnCount, columnSpacing } = this.columns;

    const availableSpace = this.pageWidth - this.margins.left - this.margins.right;
    const totalColumnSpacing = (columnCount - 1) * columnSpacing;
    return (availableSpace - totalColumnSpacing) / columnCount;
  }
}

export default Dimensions;

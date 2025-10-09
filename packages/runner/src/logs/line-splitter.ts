export class LineSplitter {
  private buffer = '';

  constructor(private readonly emit: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;

    let index = this.buffer.indexOf('\n');
    while (index !== -1) {
      this.emit(this.buffer.slice(0, index).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf('\n');
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      this.emit(this.buffer);
      this.buffer = '';
    }
  }
}

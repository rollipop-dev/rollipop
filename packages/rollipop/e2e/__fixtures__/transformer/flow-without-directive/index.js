type Props = {
  name: string,
};

function greet(props: Props): string {
  return props.name;
}

console.log(greet({ name: 'Alice' }));

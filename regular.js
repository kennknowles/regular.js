
/*
Syntax tree for regexes:
*/

dropargs = function(args, n) {
    return Array.prototype.slice.call(args, n);
}

// Scheme style algebraic data type with smart constructors that simplify.
// slightly generalized to make a canonical form with the
// same constructors, but I'm not using that.
empty = ['empty']
epsilon = ['epsilon']
literal = function(s) { 
    if (s.length == 0) 
	return epsilon;
    else
	return ['literal', s]; 
}

kleene = function(r) { 
    if ((r == epsilon) || (r == empty))
	return r;

    return ['kleene', r];
}

concat = function() { 
    if (arguments.length == 0)
	return epsilon;
    
    if (arguments[0] == empty)
	return empty;
    
    if (arguments[0] == epsilon) {
	return concat.apply(this, dropargs(arguments, 1));
    }

    if (arguments.length == 1)
	return arguments[0];

    if ((arguments.length > 1) && (arguments[0][0] == 'literal') && (arguments[1][0] == 'literal')) 
	return concat.apply(this, 
			    [['literal', arguments[0][1] + arguments[1][1]]]
			    .concat(dropargs(arguments, 2)));
    
    return ['concat'].concat(Array.prototype.slice.call(arguments));
}

or = function() {
    if (arguments.length == 0)
	return empty;

    if (arguments[0] == empty)
	return or.apply(this, dropargs(arguments, 1));

    var nonempty = _.unique(Array.prototype.slice.call(arguments))
	.filter(function(r) { return r != empty; });
    
    if (nonempty.length == 1)
	return nonempty[0];
    else
	return ['or'].concat(nonempty);
}

//and = function(r1, r2) { return ['and'] + arguments; }
//not = function(r) { return ['not', r]; }

// TODO: more than 2 streams
interleave = function(stream1, stream2) {
    if (stream1.empty())
	return stream2;
    if (stream2.empty())
	return stream1;

    return new Stream(stream1.head(), function() {
	return new Stream(stream2.head(), function() { 
	    return interleave(stream1.tail(), stream2.tail());
	});
    });
}

// TODO: more than 2 streams
combinations = function(stream1, stream2) {
    if (stream1.empty() || stream2.empty())
	return Stream.make();

    var head1 = stream1.head();
    var head2 = stream2.head();

    return new Stream([head1, head2], function() {
	var tail1 = stream1.tail();
	var tail2 = stream2.tail();

	return interleave(interleave(tail1.map(function(el1) { return [el1, head2] }),
				     tail2.map(function(el2) { return [head1, el2] })),
			  combinations(tail1, tail2));
    });
}

// zips f across a finite list of streams. curried! It really simplifies arg handling, too.
zipWith = function(f) {
    var zipWithF = function() {
	var streams = Array.prototype.slice.call(arguments);
    
	if ( _(streams).any(function(s) { return s.empty(); }) ) {
	    return Stream.make();
	}
	
	var heads = _(streams).map(function(s) { return s.head() });
	var v = f.apply(this, heads);
	
	return new Stream(v, function() {
	    return zipWithF.apply(this, _(streams).map(function(s) { return s.tail() }));
	});
    };
    
    return zipWithF;
}

concatStrings = function() {
    return Array.prototype.slice.call(arguments).join('');
}

// The language of a regular expression is an infinite set of strings. We express
// this as a Stream of the language
language = function(r) {
    switch(r[0]) {
    case 'empty': return Stream.make();
    case 'epsilon': return Stream.make(''); 
    case 'literal': return Stream.make(r[1]); 
    // TODO: case 'not': return language(Regex.or(anything....)) filter(not the regex)
	
    // TODO: more than 2 args
    case 'concat':
	return combinations(language(r[1]), language(r[2]))
	    .map(function(arr) { return arr.join(''); });
	//return zipWith(function() { return Array.prototype.slice.call(arguments).join('') })
	  //  .apply(this, _(r.slice(1)).map(language));
	
    case 'kleene': 
	return new Stream('', function() {
	    return language(concat(r[1], r));
	});

    case 'or':
	return interleave(language(r[1]), language(r[2]));
	
    // TODO: also tricky case 'and':
    }
}

// Return epsilon if the regular expression matches the empty string, else empty
nullable = function(r) {
    switch ( r[0] ) {
    case 'empty': return empty;
    case 'epsilon': return epsilon;
    case 'literal': return empty;
    case 'concat': return concat.apply(this, _(r.slice(1)).map(nullable));
    case 'or': return or.apply(this, _(r.slice(1)).map(nullable));
    case 'kleene': return epsilon;
    }
}

// Return the deriv of r if c is the first character. Curried for sauciness.
deriv = function(c) {
    return function(r) {
	switch ( r[0] ) {
	case 'empty': return empty;
	case 'epsilon': return empty;
	case 'literal': 
	    if ( r[1] == c )
		return epsilon;
	    else if ( r[1][0] == c )
		return literal(r[1].slice(1));
	    else
		return empty;
	    
	case 'concat':
	    return or(concat(nullable(r[1]), deriv(concat(r.slice(1)))),
		      concat(deriv(c)(r[1]), r.slice(1)));
	    
	case 'or': return or.apply(this, _(r.slice(1)).map(deriv(c)));
	    
	case 'kleene': concat(deriv(c)(r[1]), r)
	}
    }
}

takeArray = function(n) {
    return function(stream) {
	if ((n < 1) || stream.empty())
	    return [];
	else
	    return [stream.head()].concat(takeArray(n-1)(stream.tail()));
    };
}
